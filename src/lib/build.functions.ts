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
      .select("*, builder_cities(*), builder_repositories(*, repository_signals(*)), builder_activity(*)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const startGitHubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", context.userId)
      .single();
    if (error || !profile) throw new Error("Connect your Sui wallet before GitHub.");

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
    const { data: builder, error: builderError } = await supabaseAdmin.from("builders").upsert({
      user_id: context.userId,
      wallet_address: (await supabaseAdmin.from("profiles").select("wallet_address").eq("id", context.userId).single()).data?.wallet_address ?? "",
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
    const { data: city, error: cityError } = await supabaseAdmin.from("builder_cities").upsert({
      builder_id: builder.id, city_level: level, city_score: score,
      tier_key: cityTierValue.key, land_slots: Math.max(6, verified.length + 1), updated_at: new Date().toISOString(),
    }, { onConflict: "builder_id" }).select("id").single();
    if (cityError || !city) throw cityError ?? new Error("Builder City could not be created.");
    await supabaseAdmin.from("city_buildings").delete().eq("city_id", city.id);
    if (verified.length) await supabaseAdmin.from("city_buildings").insert(verified.flatMap((item, position) => {
      const repositoryId = repoIds.get(item.repo.id);
      return repositoryId ? [{
        city_id: city.id,
        repository_id: repositoryId,
        building_type: item.result.buildingType,
        building_level: item.result.buildingLevel,
        district_key: item.result.buildingType,
        position_x: position % 4,
        position_y: Math.floor(position / 4),
      }] : [];
    }));

    const activity = new Map<string, number>();
    for (const item of verified) for (const day of item.activity) activity.set(day.date, (activity.get(day.date) ?? 0) + day.count);
    for (const [date, commits] of activity) {
      await supabaseAdmin.from("builder_activity").upsert({ builder_id: builder.id, activity_day: date, commits }, { onConflict: "builder_id,activity_day" });
    }
    return { connected: true as const, username: githubUser.login, verified: verified.length, analyzed: analyzed.length, score };
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
      .select("*, builder_cities(*), builder_repositories(*, repository_signals(*)), builder_activity(*)")
      .ilike("github_username", data.username)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw error;
    return builder;
  });
