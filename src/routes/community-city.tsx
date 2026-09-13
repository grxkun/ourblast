import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Box, Network } from "lucide-react";

import { getCommunityCity } from "@/lib/ecosystem.functions";

export const Route = createFileRoute("/community-city")({
  head: () => ({ meta: [
    { title: "Sui Community City — Blast Build" },
    { name: "description", content: "Explore the shared Blast Build city formed by verified Sui builders, repositories, districts, and Move packages." },
    { property: "og:title", content: "Sui Community City — Blast Build" },
    { property: "og:description", content: "The global city built from verified Sui ecosystem activity." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: CommunityCityPage,
});

function CommunityCityPage() {
  const fetchCity = useServerFn(getCommunityCity);
  const city = useQuery({ queryKey: ["community-city"], queryFn: () => fetchCity() });
  const data = city.data;
  const totalPackages = data?.districts.reduce((sum, item) => sum + item.packages, 0) ?? 0;
  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg px-4 py-10 text-build-text lg:-mb-16"><main className="mx-auto max-w-6xl">
    <header className="build-console relative overflow-hidden p-6 sm:p-10"><div className="build-blueprint absolute inset-0 opacity-40"/><div className="relative"><p className="font-mono text-xs font-bold text-build-cyan">GLOBAL GRID / LIVE OPEN-SOURCE ACTIVITY</p><h1 className="mt-3 font-build text-6xl sm:text-8xl">COMMUNITY CITY</h1><p className="mt-5 max-w-2xl text-lg text-build-muted">Districts are formed from established independent Sui projects discovered on GitHub. Builder Cities remain separate and belong to their connected creators.</p><div className="mt-7 grid max-w-2xl grid-cols-3 gap-px bg-build-line font-mono"><div className="bg-build-panel p-4"><small className="text-build-muted">BUILDERS</small><b className="mt-1 block text-2xl">{data?.builders.length ?? 0}</b></div><div className="bg-build-panel p-4"><small className="text-build-muted">PROJECTS</small><b className="mt-1 block text-2xl">{data?.projects.length ?? 0}</b></div><div className="bg-build-panel p-4"><small className="text-build-muted">MOVE PROJECTS</small><b className="mt-1 block text-2xl">{totalPackages}</b></div></div></div></header>
    <section className="mt-10 grid gap-px border-2 border-build-line bg-build-line sm:grid-cols-2 lg:grid-cols-3">{data?.districts.map((district, index) => <article key={district.key} className="relative min-h-56 overflow-hidden bg-build-panel p-5"><span className="font-mono text-[0.6rem] text-build-cyan">DISTRICT_{String(index + 1).padStart(2, "0")}</span><div className="my-8 flex items-end justify-center gap-2" aria-hidden="true"><span className="h-12 w-9 border-2 border-build-line bg-build-bg"/><span className="flex h-24 w-16 items-center justify-center border-2 border-build-line bg-build-cyan text-build-bg"><Building2/></span><span className="h-16 w-11 border-2 border-build-line bg-build-bg"/></div><h2 className="font-build text-3xl normal-case">{district.key.replaceAll("-", " ")}</h2><p className="mt-2 font-mono text-xs text-build-muted">{district.projects} projects · {district.packages} packages · {district.reputation.toLocaleString()} reputation</p></article>)}</section>
    {!city.isLoading && !data?.districts.length ? <section className="mt-10 border-2 border-build-line p-10 text-center"><Network className="mx-auto size-10 text-build-cyan"/><h2 className="mt-4 font-build text-4xl">THE GRID IS WAITING.</h2><p className="mt-2 text-build-muted">Live GitHub discovery is temporarily unavailable.</p></section> : null}
    <section className="mt-12"><p className="font-mono text-xs font-bold text-build-cyan">CITY DIRECTORY</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data?.builders.map((builder) => <Link key={builder.id} to="/builder/$username" params={{ username: builder.github_username ?? "builder" }} className="border border-build-line bg-build-panel p-4 hover:border-build-cyan"><Box className="size-5 text-build-cyan"/><strong className="mt-4 block font-build text-xl normal-case">@{builder.github_username}</strong><span className="font-mono text-[0.6rem] text-build-muted">REP {builder.sui_reputation_score.toLocaleString()} · {builder.verified_package_count} PKG</span></Link>)}</div></section>
  </main></div>;
}