import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Award, Github, Zap } from "lucide-react";

import { BuilderCity } from "@/components/build/BuilderCity";
import { CityShareCard } from "@/components/build/CityShareCard";
import { BUILDING_LABELS, type BuildingType } from "@/lib/blast-build.config";
import { getPublicBuilder } from "@/lib/build.functions";
import type { Database } from "@/integrations/supabase/types";

type BuilderRepository = Database["public"]["Tables"]["builder_repositories"]["Row"] & {
  repository_signals: Database["public"]["Tables"]["repository_signals"]["Row"][];
};

export const Route = createFileRoute("/builder/$username")({
  loader: async ({ params }) => {
    const builder = await getPublicBuilder({ data: { username: params.username.replace(/^@/, "") } });
    if (!builder) throw notFound();
    return builder;
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.github_username ?? params.username;
    return { meta: [
      { title: `@${name}'s Sui Builder City — Blast Build` },
      { name: "description", content: `Explore @${name}'s verified Sui repositories, Builder Score, and living Blast Build city.` },
      { property: "og:title", content: `@${name}'s Sui Builder City` },
      { property: "og:description", content: `Verified Sui development transformed into a living Builder City on OURBLAST.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  component: PublicBuilder,
  notFoundComponent: () => <main className="theme-build flex min-h-[70vh] flex-col items-center justify-center bg-build-bg px-6 text-center text-build-text"><p className="font-mono text-xs text-build-cyan">BUILDER NOT FOUND</p><h1 className="mt-3 font-build text-5xl font-bold normal-case">This city hasn't been built yet.</h1><Link to="/build" className="mt-6 text-build-cyan hover:underline">Build yours →</Link></main>,
});

function PublicBuilder() {
  const builder = Route.useLoaderData();
  const repos = ((builder.builder_repositories ?? []) as BuilderRepository[]).filter((repo) => repo.verified).sort((a, b) => b.sui_relevance - a.sui_relevance);
  const city = builder.builder_cities;
  const badges = builder.builder_badges ?? [];
  const districts = city?.city_districts ?? [];
  const events = (city?.city_events ?? []).slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  const packages = builder.builder_sui_packages ?? [];
  const achievements = builder.builder_achievements ?? [];
  const buildings = repos.map((repo, index) => ({
    id: repo.id, building_type: repo.building_type, building_level: repo.building_level,
    district_key: repo.building_type, position_x: index % 4, position_y: Math.floor(index / 4),
    builder_repositories: { name: repo.name, sui_relevance: repo.sui_relevance, description: repo.description },
  }));
  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg text-build-text lg:-mb-16">
    <header className="border-b border-build-line px-4 py-5"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/build" className="font-build text-xl font-bold normal-case"><span className="text-build-cyan">BLAST</span> BUILD</Link><CityShareCard compact username={builder.github_username ?? "builder"} cityLevel={city?.city_level ?? builder.builder_level} builderPower={city?.builder_power ?? builder.builder_score} projects={builder.verified_repository_count} commits={builder.total_commits} packages={builder.verified_package_count}/></div></header>
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid items-center gap-8 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <div className="flex items-center gap-4"><img src={builder.github_avatar_url ?? ""} alt={`${builder.github_username} GitHub avatar`} className="size-16 border border-build-line object-cover"/><div><p className="font-mono text-xs text-build-cyan">SUI BUILDER #{String(builder.github_id ?? 0).slice(-4)}</p><h1 className="font-build text-4xl font-bold normal-case">@{builder.github_username}</h1></div></div>
          <p className="mt-5 max-w-md text-build-muted">{builder.github_bio ?? "Building real products on Sui."}</p>
          <div className="mt-7 border-y border-build-line py-5"><p className="font-mono text-xs text-build-muted">SUI BUILDER SCORE</p><p className="mt-1 font-build text-6xl font-bold text-build-cyan">{builder.builder_score.toLocaleString()}</p></div>
          <dl className="mt-5 grid grid-cols-2 gap-4 font-mono text-xs text-build-muted"><div><dt>BUILDER LEVEL</dt><dd className="mt-1 text-xl text-build-text">{builder.builder_level}</dd></div><div><dt>SUI PROJECTS</dt><dd className="mt-1 text-xl text-build-text">{builder.verified_repository_count}</dd></div><div><dt>COMMITS</dt><dd className="mt-1 text-xl text-build-text">{builder.total_commits.toLocaleString()}</dd></div><div><dt>MERGED PRS</dt><dd className="mt-1 text-xl text-build-text">{builder.merged_pull_requests}</dd></div></dl>
          <a href={`https://github.com/${builder.github_username}`} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 font-mono text-sm text-build-cyan hover:underline"><Github className="size-4"/>View GitHub</a>
        </div>
         <BuilderCity buildings={buildings} username={builder.github_username ?? "builder"} level={city?.city_level ?? builder.builder_level}/>
      </section>
       <section className="mt-12 grid gap-px border border-build-line bg-build-line sm:grid-cols-2 lg:grid-cols-5">
         {[["BUILDER POWER", city?.builder_power ?? builder.builder_score], ["SUI REPUTATION", builder.sui_reputation_score], ["CITY POWER", city?.city_power ?? 0], ["VERIFIED PACKAGES", builder.verified_package_count], ["BLAST COMMITTED", Number(city?.blast_committed ?? 0)]].map(([label, value]) => <div key={label} className="bg-build-panel p-5"><p className="font-mono text-[0.62rem] text-build-muted">{label}</p><p className="mt-2 font-build text-3xl text-build-cyan">{Number(value).toLocaleString()}</p></div>)}
       </section>
       <section className="mt-12 grid gap-6 lg:grid-cols-2">
         <div className="border-t-2 border-build-line pt-5"><p className="font-mono text-xs font-bold text-build-cyan">CITY DISTRICTS</p><div className="mt-4 flex flex-wrap gap-2">{districts.map((district) => <span key={district.id} className="border border-build-line bg-build-panel px-3 py-2 font-mono text-xs uppercase">{district.label} · {district.repository_count}</span>)}</div></div>
         <div className="border-t-2 border-build-line pt-5"><p className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><Award className="size-4"/>BUILDER BADGES</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{badges.map((badge) => <div key={badge.id} className="border border-build-line bg-build-panel p-3"><strong className="font-build text-xl normal-case">{badge.label}</strong><p className="mt-1 text-xs text-build-muted">{badge.evidence}</p></div>)}</div></div>
       </section>
       {events.length ? <section className="mt-12 border-t-2 border-build-line pt-5"><p className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><Zap className="size-4"/>CITY ACTIVITY</p><ol className="mt-4 grid gap-px border border-build-line bg-build-line sm:grid-cols-2">{events.slice(0, 8).map((event) => <li key={event.id} className="bg-build-panel p-4"><strong className="block">{event.title}</strong><p className="mt-1 text-sm text-build-muted">{event.description}</p><time className="mt-3 block font-mono text-[0.6rem] text-build-cyan">{new Date(event.occurred_at).toLocaleDateString()}</time></li>)}</ol></section> : null}
       <section className="mt-12 grid gap-6 lg:grid-cols-2"><div className="border-t-2 border-build-line pt-5"><p className="font-mono text-xs font-bold text-build-cyan">ONCHAIN PACKAGES</p><div className="mt-4 space-y-2">{packages.length ? packages.map((pkg) => <div key={pkg.id} className="border border-build-line bg-build-panel p-4"><strong className="font-mono text-sm">{pkg.package_id.slice(0, 14)}…{pkg.package_id.slice(-6)}</strong><p className="mt-2 text-xs text-build-muted">{pkg.module_count} modules · verified through {pkg.verification_source}</p></div>) : <p className="text-sm text-build-muted">No wallet-owned package has been verified yet.</p>}</div></div><div className="border-t-2 border-build-line pt-5"><p className="font-mono text-xs font-bold text-build-cyan">ACHIEVEMENTS</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{achievements.map((achievement) => <div key={achievement.id} className="border border-build-line bg-build-panel p-4"><span className={achievement.earned_at ? "font-mono text-[0.6rem] text-build-cyan" : "font-mono text-[0.6rem] text-build-muted"}>{achievement.earned_at ? "EARNED" : `${Math.min(achievement.progress, achievement.target)}/${achievement.target}`}</span><strong className="mt-2 block font-build text-xl normal-case">{achievement.label}</strong><p className="mt-1 text-xs text-build-muted">{achievement.description}</p></div>)}</div></div></section>
      <section className="mt-14"><p className="font-mono text-xs text-build-cyan">VERIFIED CONSTRUCTION</p><h2 className="mt-2 font-build text-4xl font-bold normal-case">Sui projects</h2><div className="mt-6 grid gap-px border border-build-line bg-build-line md:grid-cols-2">{repos.map((repo) => <a href={repo.html_url} target="_blank" rel="noreferrer" key={repo.id} className="bg-build-panel p-5 hover:bg-build-panel-2"><div className="flex justify-between gap-3"><h3 className="font-build text-xl font-bold normal-case">{repo.name}</h3><span className="font-mono text-xs text-build-cyan">{repo.sui_relevance}/100</span></div><p className="mt-2 text-sm text-build-muted">{repo.description ?? BUILDING_LABELS[(repo.building_type in BUILDING_LABELS ? repo.building_type : "dapp") as BuildingType]}</p><p className="mt-5 font-mono text-xs text-build-muted">{BUILDING_LABELS[(repo.building_type in BUILDING_LABELS ? repo.building_type : "dapp") as BuildingType]} · LEVEL {repo.building_level}</p></a>)}</div></section>
    </main>
  </div>;
}
