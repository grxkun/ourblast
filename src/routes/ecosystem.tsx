import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Box, Building2, GitFork, Github, Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getEcosystemProjects } from "@/lib/ecosystem.functions";

export const Route = createFileRoute("/ecosystem")({
  head: () => ({ meta: [
    { title: "Sui Developer Projects — Blast Build" },
    { name: "description", content: "Discover established open-source Sui projects from independent developers, ranked by GitHub stars." },
    { property: "og:title", content: "Sui Developer Projects — Blast Build" },
    { property: "og:description", content: "A live directory of established, individual-owned Sui repositories ranked by GitHub stars." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: EcosystemPage,
});

function EcosystemPage() {
  const fetchProjects = useServerFn(getEcosystemProjects);
  const projects = useQuery({ queryKey: ["ecosystem-projects"], queryFn: () => fetchProjects() });
  const [category, setCategory] = useState("all");
  const categories = ["all", ...new Set((projects.data ?? []).map((item) => item.category))];
  const rows = (projects.data ?? []).filter((item) => category === "all" || item.category === category);
  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg px-4 py-10 text-build-text lg:-mb-16"><main className="mx-auto max-w-6xl">
    <header className="border-b-2 border-build-line pb-8"><p className="font-mono text-xs font-bold text-build-cyan">LIVE GITHUB DISCOVERY / INDEPENDENT BUILDERS</p><h1 className="mt-3 font-build text-6xl sm:text-8xl">SUI ECOSYSTEM</h1><p className="mt-5 max-w-2xl text-lg text-build-muted">Established Sui repositories owned by individual developers, filtered for strong Sui or Move signals and ranked by GitHub stars.</p><div className="mt-6 flex flex-wrap gap-2"><Button asChild className="rounded-sm bg-build-cyan text-build-bg"><Link to="/community-city"><Building2/>Explore community city</Link></Button><Button asChild variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Link to="/builders"><Github/>Browse builder cities</Link></Button></div></header>
    <nav className="mt-8 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Project categories">{categories.map((item) => <Button key={item} type="button" onClick={() => setCategory(item)} variant={category === item ? "default" : "outline"} className={category === item ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text"}>{item.replaceAll("-", " ")}</Button>)}</nav>
    {projects.isLoading ? <p className="mt-8 font-mono text-sm text-build-muted">Discovering Sui projects on GitHub…</p> : rows.length === 0 ? <section className="mt-8 border-2 border-build-line p-10 text-center"><Box className="mx-auto size-10 text-build-cyan"/><h2 className="mt-4 font-build text-4xl">GITHUB IS QUIET.</h2><p className="mt-2 text-build-muted">Live discovery is temporarily unavailable. Try again shortly.</p></section> : <section className="mt-8 grid gap-px border-2 border-build-line bg-build-line md:grid-cols-2 lg:grid-cols-3">{rows.map((project) => <article key={project.id} className="flex min-h-64 flex-col bg-build-panel p-5"><div className="flex items-start justify-between gap-3"><span className="font-mono text-[0.62rem] font-bold uppercase text-build-cyan">{project.category}</span><span className="inline-flex items-center gap-1 font-mono text-[0.65rem] text-build-cyan"><Star className="size-3"/>{project.stars.toLocaleString()}</span></div><h2 className="mt-5 font-build text-3xl normal-case">{project.name}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-build-muted">{project.summary ?? "Open-source Sui project."}</p><div className="mt-5 grid grid-cols-2 gap-2 border-t border-build-line pt-4 font-mono text-xs"><span><small className="block text-build-muted">LANGUAGE</small>{project.language ?? "Mixed"}</span><span><small className="block text-build-muted">FORKS</small><span className="inline-flex items-center gap-1"><GitFork className="size-3"/>{project.forks.toLocaleString()}</span></span></div><div className="mt-5 flex items-center justify-between"><a href={project.ownerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-xs hover:text-build-cyan"><img src={project.ownerAvatarUrl} alt="" className="size-5 rounded-full" loading="lazy"/>@{project.owner}</a><a href={project.url} target="_blank" rel="noreferrer" aria-label={`Open ${project.fullName} on GitHub`}><ArrowUpRight className="size-4"/></a></div></article>)}</section>}
  </main></div>;
}