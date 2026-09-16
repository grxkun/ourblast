import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { classifyBuilding } from "./sui-relevance";

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  owner: { login: string; avatar_url: string; html_url: string; type: string };
};

export type DiscoveredSuiProject = {
  id: number;
  name: string;
  fullName: string;
  url: string;
  summary: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  owner: string;
  ownerAvatarUrl: string;
  ownerUrl: string;
  category: string;
  pushedAt: string | null;
};

let discoveryCache: { expiresAt: number; projects: DiscoveredSuiProject[] } | undefined;

const SEARCHES = [
  "topic:sui language:Move stars:>=3 fork:false archived:false",
  "topic:sui-move stars:>=3 fork:false archived:false",
  '"Sui blockchain" in:description stars:>=5 fork:false archived:false',
];

function isSuiProject(repo: GitHubRepository) {
  const topics = new Set(repo.topics.map((topic) => topic.toLowerCase()));
  const text = `${repo.name} ${repo.description ?? ""}`.toLowerCase();
  const explicitSui = /\bsui (blockchain|network|move|dapp|smart contract|ecosystem|package|wallet|sdk)\b/.test(text);
  const moveProject = repo.language === "Move" && (topics.has("sui") || explicitSui);
  const topicProject = (topics.has("sui") || topics.has("sui-move") || topics.has("sui-network"))
    && (["move", "blockchain", "dapp", "smart-contracts", "web3"].some((topic) => topics.has(topic)) || explicitSui);
  return repo.owner.type === "User" && !repo.archived && !repo.fork && repo.stargazers_count >= 3 && (moveProject || topicProject || explicitSui);
}

function toDiscoveredProject(repo: GitHubRepository): DiscoveredSuiProject {
  return {
    id: repo.id, name: repo.name, fullName: repo.full_name, url: repo.html_url,
    summary: repo.description, stars: repo.stargazers_count, forks: repo.forks_count,
    language: repo.language, topics: repo.topics, owner: repo.owner.login,
    ownerAvatarUrl: repo.owner.avatar_url, ownerUrl: repo.owner.html_url,
    category: classifyBuilding({
      name: repo.name, description: repo.description, topics: repo.topics,
      languages: repo.language ? { [repo.language]: 1 } : {}, treePaths: [], isFork: false,
      archived: false, stars: repo.stargazers_count, forks: repo.forks_count,
      contributors: 0, commits: 0, pullRequests: 0, mergedPullRequests: 0, issuesResolved: 0,
    }),
    pushedAt: repo.pushed_at,
  };
}

async function discoverSuiProjects() {
  if (discoveryCache && discoveryCache.expiresAt > Date.now()) return discoveryCache.projects;
  const settled = await Promise.allSettled(SEARCHES.map(async (query) => {
    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", query);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", "50");
    const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "OURBLAST-Sui-Directory", "X-GitHub-Api-Version": "2022-11-28" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`GitHub discovery failed (${response.status})`);
    return (await response.json() as { items?: GitHubRepository[] }).items ?? [];
  }));
  const repositories = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const projects = [...new Map(repositories.filter(isSuiProject).map((repo) => [repo.id, toDiscoveredProject(repo)])).values()]
    .sort((a, b) => b.stars - a.stars || (Date.parse(b.pushedAt ?? "") || 0) - (Date.parse(a.pushedAt ?? "") || 0))
    .slice(0, 200);
  if (projects.length) discoveryCache = { expiresAt: Date.now() + 15 * 60_000, projects };
  return projects.length ? projects : discoveryCache?.projects ?? [];
}

function publicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

export const getEcosystemProjects = createServerFn({ method: "GET" }).handler(async () => {
  return (await discoverSuiProjects()).slice(0, 36);
});

export const getBlastIslandDevelopers = createServerFn({ method: "GET" }).handler(async () => {
  const [projects, { data: builders, error }] = await Promise.all([
    discoverSuiProjects(),
    publicClient().from("builders")
      .select("id, github_username, github_avatar_url, builder_score, builder_level, verified_repository_count, builder_cities(city_level, tier_key)")
      .eq("is_public", true).eq("github_connected", true).limit(100),
  ]);
  if (error) throw error;
  const registered = new Map((builders ?? []).map((builder) => [(builder.github_username ?? "").toLowerCase(), builder]));
  const discovered = new Map<string, { username: string; avatarUrl: string; githubUrl: string; score: number; projects: number }>();
  for (const project of projects) {
    const key = project.owner.toLowerCase();
    const current = discovered.get(key) ?? { username: project.owner, avatarUrl: project.ownerAvatarUrl, githubUrl: project.ownerUrl, score: 0, projects: 0 };
    current.score += project.stars;
    current.projects += 1;
    discovered.set(key, current);
  }
  const usernames = new Set([...registered.keys(), ...discovered.keys()]);
  return [...usernames].map((key) => {
    const profile = registered.get(key);
    const github = discovered.get(key);
    const city = profile?.builder_cities;
    return {
      id: profile?.id ?? `github-${key}`,
      username: profile?.github_username ?? github?.username ?? key,
      avatarUrl: profile?.github_avatar_url ?? github?.avatarUrl ?? null,
      githubUrl: github?.githubUrl ?? `https://github.com/${profile?.github_username ?? key}`,
      score: profile?.builder_score ?? github?.score ?? 0,
      projects: profile?.verified_repository_count ?? github?.projects ?? 0,
      cityLevel: city?.city_level ?? Math.max(1, Math.min(20, Math.floor(Math.sqrt(github?.score ?? 0)) + 1)),
      tier: city?.tier_key ?? "discovered",
      registered: Boolean(profile),
    };
  }).sort((a, b) => b.score - a.score || b.projects - a.projects).slice(0, 100);
});

export const getEcosystemProject = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/) }).parse(input))
  .handler(async ({ data }) => {
    const { data: project, error } = await publicClient().from("ecosystem_projects")
      .select("*, builders(github_username, github_avatar_url, builder_level, sui_reputation_score, verified_package_count), builder_repositories(html_url, sui_relevance, commits, pull_requests, contributors, building_level)")
      .eq("slug", data.slug).maybeSingle();
    if (error) throw error;
    if (!project) return null;
    const { data: packages, error: packageError } = await publicClient().from("builder_sui_packages")
      .select("package_id, module_count, package_version, verification_source, verification_status, verified_at")
      .eq("repository_id", project.repository_id)
      .eq("verification_status", "verified");
    if (packageError) throw packageError;
    return { ...project, builder_sui_packages: packages ?? [] };
  });

export const getCommunityCity = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const [projects, { data: builders, error: builderError }] = await Promise.all([
    discoverSuiProjects().then((items) => items.slice(0, 36)),
    client.from("builders").select("id, github_username, builder_level, sui_reputation_score, verified_repository_count, verified_package_count, builder_cities(city_level, tier_key)").eq("is_public", true).eq("github_connected", true).order("sui_reputation_score", { ascending: false }).limit(100),
  ]);
  if (builderError) throw builderError;
  const districts = new Map<string, { projects: number; reputation: number; packages: number }>();
  for (const project of projects) {
    const current = districts.get(project.category) ?? { projects: 0, reputation: 0, packages: 0 };
    districts.set(project.category, { projects: current.projects + 1, reputation: current.reputation + project.stars, packages: current.packages + (project.language === "Move" ? 1 : 0) });
  }
  return { projects, builders: builders ?? [], districts: [...districts].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.reputation - a.reputation) };
});