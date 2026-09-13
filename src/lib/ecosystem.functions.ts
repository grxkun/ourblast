import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import type { Database } from "@/integrations/supabase/types";

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
  const { data, error } = await publicClient().from("ecosystem_projects")
    .select("*, builders(github_username, github_avatar_url, builder_level, sui_reputation_score), builder_repositories(html_url, sui_relevance, commits, building_level)")
    .order("reputation_score", { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
});

export const getCommunityCity = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const [{ data: projects, error: projectError }, { data: builders, error: builderError }] = await Promise.all([
    client.from("ecosystem_projects").select("id, slug, name, category, package_count, reputation_score, builders(github_username), builder_repositories(building_level)").order("reputation_score", { ascending: false }).limit(120),
    client.from("builders").select("id, github_username, builder_level, sui_reputation_score, verified_repository_count, verified_package_count, builder_cities(city_level, tier_key)").eq("is_public", true).eq("github_connected", true).order("sui_reputation_score", { ascending: false }).limit(100),
  ]);
  if (projectError) throw projectError;
  if (builderError) throw builderError;
  const districts = new Map<string, { projects: number; reputation: number; packages: number }>();
  for (const project of projects ?? []) {
    const current = districts.get(project.category) ?? { projects: 0, reputation: 0, packages: 0 };
    districts.set(project.category, { projects: current.projects + 1, reputation: current.reputation + project.reputation_score, packages: current.packages + project.package_count });
  }
  return { projects: projects ?? [], builders: builders ?? [], districts: [...districts].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.reputation - a.reputation) };
});