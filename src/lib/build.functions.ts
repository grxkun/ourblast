import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { BLAST_BUILD, cityTier } from "./blast-build.config";
import { scoreSuiRepository, type RepositoryEvidence } from "./sui-relevance";

const GATEWAY = "https://connector-gateway.lovable.dev";

async function githubJson<T>(connectionKey: string, path: string): Promise<T> {
  const { callGitHub } = await import("@/integrations/lovable/appUserConnector.server");
  const response = await callGitHub(connectionKey, path);
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub's request limit is temporarily exhausted. Try syncing again later.");
    }
    throw new Error(`GitHub request failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return JSON.parse(text) as T;
}

async function optionalGithubJson<T>(connectionKey: string, path: string, fallback: T): Promise<T> {
  try { return await githubJson<T>(connectionKey, path); } catch { return fallback; }
}

async function fileText(connectionKey: string, owner: string, repo: string, path: string) {
  const body = await optionalGithubJson<{ content?: string; encoding?: string } | null>(
    connectionKey,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
    null,
  );
  if (!body?.content || body.encoding !== "base64") return undefined;
  return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 80_000);
}

export const getMyBuilder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("builders")
      .select("*, builder_cities(*, city_districts(*), city_events(*), city_buildings(*, building_upgrades(*))), builder_repositories(*, repository_signals(*)), builder_activity(*), builder_badges(*), builder_sui_packages(*), builder_achievements(*)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const getBuilderWalletAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .single();
    if (error || !profile) throw new Error("Sui wallet not found.");
    const tokenType = process.env['BLAST_TOKEN_TYPE']?.trim() || BLAST_BUILD.blastTokenType;
    const response = await fetch("https://graphql.mainnet.sui.io/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query WalletBalances($address: SuiAddress!) { address(address: $address) { balances(first: 100) { nodes { coinType { repr } totalBalance coinObjectCount } } } }",
        variables: { address: profile.wallet_address },
      }),
    });
    if (!response.ok) throw new Error("Sui balances are temporarily unavailable.");
    const payload = await response.json() as { data?: { address?: { balances?: { nodes?: Array<{ coinType?: { repr?: string }; totalBalance?: string }> } } } };
    const balances = payload.data?.address?.balances?.nodes ?? [];
    const normalized = (value: string) => value.toLowerCase().replace(/^0x0+/, "0x");
    const sui = balances.find((item) => normalized(item.coinType?.repr ?? "") === "0x2::sui::sui");
    const blast = tokenType ? balances.find((item) => normalized(item.coinType?.repr ?? "") === normalized(tokenType)) : undefined;
    return {
      walletAddress: profile.wallet_address,
      sui: Number(sui?.totalBalance ?? 0) / 1_000_000_000,
      blast: blast ? Number(blast.totalBalance ?? 0) / 10 ** BLAST_BUILD.blastDecimals : 0,
      blastConfigured: true,
    };
  });

export const startGitHubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .single();
    if (error || !profile?.wallet_address) throw new Error("Connect your Sui wallet before GitHub.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("builders").upsert({
      user_id: context.userId,
      wallet_address: profile.wallet_address,
      sui_verified: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    const { loadConnectionKey } = await import("./app-user-connections.server");
    const existingKey = await loadConnectionKey(context.userId);
    const request = getRequest();
    if (!request) throw new Error("GitHub connection must start in the app.");
    const url = new URL(request.url);
    const forwarded = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const origin = forwarded ? `https://${forwarded}` : url.origin;
    const { authorizeGitHub } = await import("@/integrations/lovable/appUserConnector.server");
    return {
      authorizationUrl: await authorizeGitHub({
        appUserId: context.userId,
        returnUrl: new URL("/oauth/github/return", origin).toString(),
        ...(existingKey ? { connectionAPIKey: existingKey } : {}),
      }),
    };
  });

export const completeGitHubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(8).max(2048) }).parse(input))
  .handler(async ({ data, context }) => {
    const { exchangeGitHubCode } = await import("@/integrations/lovable/appUserConnector.server");
    const connectionKey = await exchangeGitHubCode(data.code);
    const { saveConnectionKey } = await import("./app-user-connections.server");
    await saveConnectionKey(context.userId, connectionKey);
    return { ok: true };
  });

export const syncGitHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadConnectionKey } = await import("./app-user-connections.server");
    const connectionKey = await loadConnectionKey(context.userId);
    if (!connectionKey) return { connected: false as const, reconnectRequired: false };

    type GitHubUser = { id: number; login: string; avatar_url: string; name: string | null; bio: string | null };
    type GitHubRepo = {
      id: number; name: string; full_name: string; html_url: string; description: string | null;
      language: string | null; topics?: string[]; stargazers_count: number; forks_count: number;
      fork: boolean; archived: boolean; default_branch: string; created_at: string; pushed_at: string;
      owner: { login: string };
    };
    const [githubUser, allRepos] = await Promise.all([
      githubJson<GitHubUser>(connectionKey, "/user"),
      githubJson<GitHubRepo[]>(connectionKey, "/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100"),
    ]);
    const repos = allRepos.filter((repo) => !repo.archived).slice(0, 20);

    const analyzed = [] as Array<{ repo: GitHubRepo; evidence: RepositoryEvidence; result: ReturnType<typeof scoreSuiRepository>; activity: Array<{ date: string; count: number }> }>;
    for (let index = 0; index < repos.length; index += 4) {
      const chunk = repos.slice(index, index + 4);
      analyzed.push(...await Promise.all(chunk.map(async (repo) => {
        const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
        const [languages, tree, commits, pulls, contributors, moveToml, packageJson, cargoToml, readme] = await Promise.all([
          optionalGithubJson<Record<string, number>>(connectionKey, `${base}/languages`, {}),
          optionalGithubJson<{ tree?: Array<{ path?: string }> }>(connectionKey, `${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`, {}),
          optionalGithubJson<Array<{ commit?: { author?: { date?: string } } }>>(connectionKey, `${base}/commits?per_page=100`, []),
          optionalGithubJson<Array<{ merged_at?: string | null }>>(connectionKey, `${base}/pulls?state=all&per_page=100`, []),
          optionalGithubJson<Array<{ id: number }>>(connectionKey, `${base}/contributors?per_page=100&anon=1`, []),
          fileText(connectionKey, repo.owner.login, repo.name, "Move.toml"),
          fileText(connectionKey, repo.owner.login, repo.name, "package.json"),
          fileText(connectionKey, repo.owner.login, repo.name, "Cargo.toml"),
          fileText(connectionKey, repo.owner.login, repo.name, "README.md"),
        ]);
        const evidence: RepositoryEvidence = {
          name: repo.name, description: repo.description, topics: repo.topics ?? [], languages,
          treePaths: (tree.tree ?? []).flatMap((item) => item.path ? [item.path] : []),
          ...(moveToml ? { moveToml } : {}),
          ...(packageJson ? { packageJson } : {}),
          ...(cargoToml ? { cargoToml } : {}),
          ...(readme ? { readme } : {}),
          isFork: repo.fork, archived: repo.archived,
          stars: repo.stargazers_count, forks: repo.forks_count, contributors: contributors.length,
          commits: commits.length, pullRequests: pulls.length,
          mergedPullRequests: pulls.filter((pull) => pull.merged_at).length, issuesResolved: 0,
          createdAt: repo.created_at, pushedAt: repo.pushed_at,
        };
        const days = new Map<string, number>();
        for (const commit of commits) {
          const date = commit.commit?.author?.date?.slice(0, 10);
          if (date) days.set(date, (days.get(date) ?? 0) + 1);
        }
        return { repo, evidence, result: scoreSuiRepository(evidence), activity: [...days].map(([date, count]) => ({ date, count })) };
      })));
    }

    const verified = analyzed.filter((item) => item.result.verified);
    const score = Math.round(Math.min(10_000, verified.reduce((sum, item) => {
      const source = item.evidence;
      const component = item.result.relevance * BLAST_BUILD.scoring.suiRelevance
        + item.result.developmentScore * BLAST_BUILD.scoring.developmentActivity
        + item.result.qualityScore * BLAST_BUILD.scoring.repositoryQuality
        + Math.min(100, source.contributors * 8 + source.mergedPullRequests * 2) * BLAST_BUILD.scoring.openSourceActivity
        + 100 * BLAST_BUILD.scoring.suiVerification;
      return sum + component * 18;
    }, 0)));
    const level = Math.max(1, Math.floor(Math.sqrt(score / 40)) + 1);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const walletAddress = (await supabaseAdmin.from("profiles").select("wallet_address").eq("id", context.userId).single()).data?.wallet_address ?? "";
    const { data: builder, error: builderError } = await supabaseAdmin.from("builders").upsert({
      user_id: context.userId,
      wallet_address: walletAddress,
      github_id: githubUser.id,
      github_username: githubUser.login,
      github_avatar_url: githubUser.avatar_url,
      github_name: githubUser.name,
      github_bio: githubUser.bio,
      github_connected: true,
      sui_verified: true,
      builder_score: score,
      builder_level: level,
      verified_repository_count: verified.length,
      total_commits: verified.reduce((sum, item) => sum + item.evidence.commits, 0),
      total_pull_requests: verified.reduce((sum, item) => sum + item.evidence.pullRequests, 0),
      merged_pull_requests: verified.reduce((sum, item) => sum + item.evidence.mergedPullRequests, 0),
      oss_contributions: verified.reduce((sum, item) => sum + item.evidence.mergedPullRequests + item.evidence.contributors, 0),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("id").single();
    if (builderError || !builder) throw builderError ?? new Error("Builder profile could not be saved.");

    const repoIds = new Map<number, string>();
    for (const item of analyzed) {
      const { repo, evidence, result } = item;
      const { data: saved, error } = await supabaseAdmin.from("builder_repositories").upsert({
        builder_id: builder.id, github_repo_id: repo.id, name: repo.name, full_name: repo.full_name,
        html_url: repo.html_url, description: repo.description, primary_language: repo.language,
        topics: repo.topics ?? [], stars: repo.stargazers_count, forks: repo.forks_count,
        contributors: evidence.contributors, commits: evidence.commits, pull_requests: evidence.pullRequests,
        merged_pull_requests: evidence.mergedPullRequests, issues_resolved: evidence.issuesResolved,
        sui_relevance: result.relevance, development_score: result.developmentScore,
        quality_score: result.qualityScore, building_type: result.buildingType,
        building_level: result.buildingLevel, verified: result.verified, is_fork: repo.fork,
        is_archived: repo.archived, default_branch_sha: repo.default_branch,
        repo_created_at: repo.created_at, repo_pushed_at: repo.pushed_at,
        analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "github_repo_id" }).select("id").single();
      if (error || !saved) throw error ?? new Error("Repository could not be saved.");
      repoIds.set(repo.id, saved.id);
      await supabaseAdmin.from("repository_signals").delete().eq("repository_id", saved.id);
      if (result.signals.length) await supabaseAdmin.from("repository_signals").insert(result.signals.map((signal) => ({
        repository_id: saved.id, signal_key: signal.key, label: signal.label,
        strength: signal.strength, points: signal.points, evidence: signal.evidence,
      })));
    }

    const cityTierValue = cityTier(level);
    const freeLand = BLAST_BUILD.freeLand.base
      + verified.length * BLAST_BUILD.freeLand.perVerifiedRepository
      + Math.floor(score / BLAST_BUILD.freeLand.builderScoreStep) * BLAST_BUILD.freeLand.plotsPerScoreStep;
    const { data: city, error: cityError } = await supabaseAdmin.from("builder_cities").upsert({
      builder_id: builder.id, city_level: level, city_score: score,
      tier_key: cityTierValue.key, land_slots: freeLand, free_land: freeLand,
      builder_power: score, updated_at: new Date().toISOString(),
    }, { onConflict: "builder_id" }).select("id").single();
    if (cityError || !city) throw cityError ?? new Error("Builder City could not be created.");
    const activeRepositoryIds = verified.flatMap((item) => {
      const repositoryId = repoIds.get(item.repo.id);
      return repositoryId ? [repositoryId] : [];
    });
    const { data: existingBuildings } = await supabaseAdmin.from("city_buildings").select("id, repository_id").eq("city_id", city.id);
    const staleBuildingIds = (existingBuildings ?? []).filter((item) => item.repository_id && !activeRepositoryIds.includes(item.repository_id)).map((item) => item.id);
    if (staleBuildingIds.length) await supabaseAdmin.from("city_buildings").delete().in("id", staleBuildingIds);
    for (const row of verified.flatMap((item, position) => {
      const repositoryId = repoIds.get(item.repo.id);
      return repositoryId ? [{
        city_id: city.id,
        repository_id: repositoryId,
        building_type: item.result.buildingType,
        building_level: item.result.buildingLevel,
        developer_level: item.result.buildingLevel,
        developer_xp: Math.min(10_000, item.evidence.commits * 3 + item.evidence.mergedPullRequests * 12 + item.evidence.contributors * 20 + item.result.relevance * 2),
        district_key: item.result.buildingType,
        position_x: position % 4,
        position_y: Math.floor(position / 4),
      }] : [];
    })) await supabaseAdmin.from("city_buildings").upsert(row, { onConflict: "city_id,repository_id" });

    const districtCounts = new Map<string, number>();
    for (const item of verified) districtCounts.set(item.result.buildingType, (districtCounts.get(item.result.buildingType) ?? 0) + 1);
    for (const [districtKey, repositoryCount] of districtCounts) {
      await supabaseAdmin.from("city_districts").upsert({
        city_id: city.id,
        district_key: districtKey,
        label: `${districtKey.replace(/(^.|-.)/g, (part) => part.replace("-", " ").toUpperCase())} District`,
        repository_count: repositoryCount,
        unlocked_by: "builder",
        blast_cost: 0,
      }, { onConflict: "city_id,district_key" });
    }

    const badges = [
      ...(verified.length ? [{ badge_key: "sui-builder", label: "Sui Builder", evidence: `${verified.length} verified Sui project${verified.length === 1 ? "" : "s"}` }] : []),
      ...(verified.some((item) => (item.evidence.languages['Move'] ?? 0) > 0) ? [{ badge_key: "move-developer", label: "Move Developer", evidence: "Verified Move source and package activity" }] : []),
      ...(verified.some((item) => item.evidence.mergedPullRequests > 0 || item.evidence.contributors > 1) ? [{ badge_key: "open-source-builder", label: "Open Source Builder", evidence: "Verified collaborative repository activity" }] : []),
      ...(verified.some((item) => item.evidence.pushedAt && Date.now() - Date.parse(item.evidence.pushedAt) < 30 * 86_400_000) ? [{ badge_key: "active-builder", label: "Active Builder", evidence: "Verified Sui project activity in the last 30 days" }] : []),
    ];
    for (const badge of badges) await supabaseAdmin.from("builder_badges").upsert({ builder_id: builder.id, ...badge }, { onConflict: "builder_id,badge_key" });

    for (const item of verified) {
      const repositoryId = repoIds.get(item.repo.id);
      if (!repositoryId) continue;
      const { count } = await supabaseAdmin.from("city_events").select("id", { count: "exact", head: true }).eq("city_id", city.id).eq("repository_id", repositoryId).eq("event_type", "repository_verified");
      if (!count) await supabaseAdmin.from("city_events").insert({ city_id: city.id, repository_id: repositoryId, event_type: "repository_verified", title: `${item.repo.name} joined the city`, description: `Verified at ${item.result.relevance}/100 Sui relevance.`, event_value: item.result.buildingLevel, occurred_at: item.evidence.pushedAt ?? new Date().toISOString() });
    }

    const activity = new Map<string, number>();
    for (const item of verified) for (const day of item.activity) activity.set(day.date, (activity.get(day.date) ?? 0) + day.count);
    for (const [date, commits] of activity) {
      await supabaseAdmin.from("builder_activity").upsert({ builder_id: builder.id, activity_day: date, commits }, { onConflict: "builder_id,activity_day" });
    }

    const { extractPackageIds, verifySuiPackage, detectWalletPackages } = await import("./sui-packages.server");
    const walletPackages = walletAddress ? await detectWalletPackages(walletAddress) : [];
    const walletPackageIds = new Set(walletPackages.map((item) => item.packageId.toLowerCase()));
    const packageRows = new Map<string, {
      builder_id: string; repository_id: string | null; package_id: string; network: string; module_count: number;
      package_version: number; verification_source: string; verification_status: string; published_tx_digest: string | null;
      evidence: { moduleNames: string[]; publisher: string | null; githubMentioned: boolean }; verified_at: string;
    }>();
    for (const proof of walletPackages) {
      packageRows.set(proof.packageId.toLowerCase(), {
        builder_id: builder.id, repository_id: null, package_id: proof.packageId, network: BLAST_BUILD.suiNetwork,
        module_count: proof.moduleNames.length, package_version: proof.version, verification_source: "wallet", verification_status: "verified",
        published_tx_digest: proof.digest, evidence: { moduleNames: proof.moduleNames, publisher: proof.publisher, githubMentioned: false },
        verified_at: proof.timestamp ?? new Date().toISOString(),
      });
    }
    for (const item of verified) {
      const repositoryId = repoIds.get(item.repo.id);
      if (!repositoryId) continue;
      const candidateIds = extractPackageIds(item.evidence.moveToml, item.evidence.packageJson, item.evidence.readme);
      for (const candidateId of candidateIds) {
        const proof = walletPackages.find((entry) => entry.packageId.toLowerCase() === candidateId) ?? await verifySuiPackage(candidateId);
        if (!proof) continue;
        const owned = proof.publisher === walletAddress.toLowerCase() || walletPackageIds.has(proof.packageId.toLowerCase());
        if (!owned) continue;
        packageRows.set(proof.packageId.toLowerCase(), {
          builder_id: builder.id, repository_id: repositoryId, package_id: proof.packageId, network: BLAST_BUILD.suiNetwork,
          module_count: proof.moduleNames.length, package_version: proof.version, verification_source: "both", verification_status: "verified",
          published_tx_digest: proof.digest, evidence: { moduleNames: proof.moduleNames, publisher: proof.publisher, githubMentioned: true },
          verified_at: proof.timestamp ?? new Date().toISOString(),
        });
      }
    }
    for (const row of packageRows.values()) await supabaseAdmin.from("builder_sui_packages").upsert(row, { onConflict: "builder_id,package_id,network" });
    if (packageRows.size) await supabaseAdmin.from("builder_badges").upsert({ builder_id: builder.id, badge_key: "onchain-shipper", label: "Onchain Shipper", evidence: `${packageRows.size} wallet-owned Move package${packageRows.size === 1 ? "" : "s"} verified on Sui mainnet` }, { onConflict: "builder_id,badge_key" });

    const achievementRows = [
      { achievement_key: "first-foundation", label: "City Founder", description: "Verify your first Sui repository.", progress: verified.length, target: 1, evidence: { verifiedRepositories: verified.length } },
      { achievement_key: "move-builder", label: "Move Builder", description: "Ship a verified repository containing Move source.", progress: verified.filter((item) => (item.evidence.languages['Move'] ?? 0) > 0).length, target: 1, evidence: { moveRepositories: verified.filter((item) => (item.evidence.languages['Move'] ?? 0) > 0).length } },
      { achievement_key: "open-source-operator", label: "Open Source Operator", description: "Record 10 merged pull requests across verified Sui projects.", progress: verified.reduce((sum, item) => sum + item.evidence.mergedPullRequests, 0), target: 10, evidence: { mergedPullRequests: verified.reduce((sum, item) => sum + item.evidence.mergedPullRequests, 0) } },
      { achievement_key: "onchain-shipper", label: "Onchain Shipper", description: "Publish a verified Move package from your connected wallet.", progress: packageRows.size, target: 1, evidence: { verifiedPackages: packageRows.size } },
      { achievement_key: "city-architect", label: "City Architect", description: "Grow five verified Sui repository buildings.", progress: verified.length, target: 5, evidence: { verifiedRepositories: verified.length } },
    ];
    for (const achievement of achievementRows) await supabaseAdmin.from("builder_achievements").upsert({
      builder_id: builder.id, ...achievement,
      earned_at: achievement.progress >= achievement.target ? new Date().toISOString() : null,
    }, { onConflict: "builder_id,achievement_key" });

    const earnedAchievements = achievementRows.filter((item) => item.progress >= item.target).length;
    const reputation = Math.min(10_000, Math.round(score * 0.65 + packageRows.size * 350 + earnedAchievements * 150));
    await supabaseAdmin.from("builders").update({ sui_reputation_score: reputation, verified_package_count: packageRows.size, builder_achievement_count: earnedAchievements }).eq("id", builder.id);
    return { connected: true as const, username: githubUser.login, verified: verified.length, analyzed: analyzed.length, score, packages: packageRows.size, reputation };
  });

export const getPublicBuilder = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ username: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/) }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const client = createClient<Database>(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: builder, error } = await client.from("builders")
      .select("*, builder_cities(*, city_districts(*), city_events(*), city_buildings(*, building_upgrades(*))), builder_repositories(*, repository_signals(*)), builder_activity(*), builder_badges(*), builder_sui_packages(*), builder_achievements(*)")
      .ilike("github_username", data.username)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw error;
    return builder;
  });

const leaderboardInput = z.object({
  metric: z.enum(["builder", "city", "blast", "weekly", "rising", "open-source", "reputation"]),
});

const previewCommitmentInput = z.object({
  amount: z.number().positive().max(1_000_000),
  purpose: z.enum(["land", "building", "district", "cosmetic", "landmark"]),
});

export const previewBlastCommitment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => previewCommitmentInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!BLAST_BUILD.blastTokenType) throw new Error("BLAST token configuration is unavailable.");
    const { data: builder, error } = await context.supabase
      .from("builders")
      .select("id, builder_cities(id)")
      .eq("user_id", context.userId)
      .single();
    if (error || !builder?.builder_cities) throw new Error("Generate your free Builder City first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error: previewError } = await supabaseAdmin.from("blast_commitments").insert({
      builder_id: builder.id,
      city_id: builder.builder_cities.id,
      user_id: context.userId,
      amount_atomic: Math.round(data.amount * 10 ** BLAST_BUILD.blastDecimals),
      amount_display: data.amount,
      token_type: BLAST_BUILD.blastTokenType,
      network: BLAST_BUILD.suiNetwork,
      purpose: data.purpose,
      status: "preview",
    }).select("id, amount_display, purpose, status, created_at").single();
    if (previewError || !preview) throw previewError ?? new Error("Preview could not be recorded.");
    return { ...preview, previewOnly: true as const, reason: "Reversible lock contract not yet deployed" };
  });

export const getBuilderLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((input) => leaderboardInput.parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const client = createClient<Database>(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: builders, error } = await client
      .from("builders")
      .select("id, github_username, github_avatar_url, builder_score, builder_level, verified_repository_count, verified_package_count, sui_reputation_score, total_commits, merged_pull_requests, oss_contributions, builder_cities(city_level, city_score, blast_committed, tier_key), builder_activity(activity_day, commits, pull_requests, packages, oss_contributions), builder_sui_packages(verified_at)")
      .eq("is_public", true)
      .eq("github_connected", true)
      .limit(100);
    if (error) throw error;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const rows = (builders ?? []).map((builder) => {
      const city = builder.builder_cities;
      const weekly = (builder.builder_activity ?? [])
        .filter((activity) => activity.activity_day >= sevenDaysAgo)
        .reduce((sum, activity) => sum + activity.commits * 3 + activity.pull_requests * 8 + activity.packages * 12 + activity.oss_contributions * 6, 0);
      const recentPackages = (builder.builder_sui_packages ?? []).filter((item) => item.verified_at && item.verified_at >= `${sevenDaysAgo}T00:00:00.000Z`).length;
      const rising = weekly + Math.min(500, recentPackages * 100);
      const value = data.metric === "city" ? (city?.city_score ?? 0)
        : data.metric === "blast" ? Number(city?.blast_committed ?? 0)
        : data.metric === "weekly" ? weekly
        : data.metric === "rising" ? rising
        : data.metric === "open-source" ? builder.oss_contributions
        : data.metric === "reputation" ? builder.sui_reputation_score
        : builder.builder_score;
      return {
        id: builder.id,
        username: builder.github_username ?? "builder",
        avatarUrl: builder.github_avatar_url,
        builderScore: builder.builder_score,
        builderLevel: builder.builder_level,
        verifiedProjects: builder.verified_repository_count,
        commits: builder.total_commits,
        mergedPullRequests: builder.merged_pull_requests,
        ossContributions: builder.oss_contributions,
        verifiedPackages: builder.verified_package_count,
        suiReputation: builder.sui_reputation_score,
        cityLevel: city?.city_level ?? 1,
        cityScore: city?.city_score ?? 0,
        blastCommitted: Number(city?.blast_committed ?? 0),
        tier: city?.tier_key ?? "foundation",
        weeklyScore: weekly,
        risingScore: rising,
        value,
      };
    }).sort((a, b) => b.value - a.value || b.builderScore - a.builderScore);
    return rows.slice(0, 50).map((row, index) => ({ ...row, rank: index + 1 }));
  });
