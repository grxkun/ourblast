import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Box, Building2, Github, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getEcosystemProjects } from "@/lib/ecosystem.functions";

export const Route = createFileRoute("/ecosystem")({
  head: () => ({ meta: [
    { title: "Verified Sui Ecosystem Projects — Blast Build" },
    { name: "description", content: "Discover verified Sui repositories, on-chain Move packages, project categories, and the builders behind them." },
    { property: "og:title", content: "Verified Sui Ecosystem Projects — Blast Build" },
    { property: "og:description", content: "A public directory built from verified Sui code and on-chain package evidence." },
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
    <header className="border-b-2 border-build-line pb-8"><p className="font-mono text-xs font-bold text-build-cyan">CODE + CHAIN / VERIFIED DIRECTORY</p><h1 className="mt-3 font-build text-6xl sm:text-8xl">SUI ECOSYSTEM</h1><p className="mt-5 max-w-2xl text-lg text-build-muted">Projects enter this directory through verified Sui code. Package marks appear only after mainnet evidence is confirmed.</p><div className="mt-6 flex flex-wrap gap-2"><Button asChild className="rounded-sm bg-build-cyan text-build-bg"><Link to="/community-city"><Building2/>Explore community city</Link></Button><Button asChild variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Link to="/build"><Github/>Add your project</Link></Button></div></header>
    <nav className="mt-8 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Project categories">{categories.map((item) => <Button key={item} type="button" onClick={() => setCategory(item)} variant={category === item ? "default" : "outline"} className={category === item ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text"}>{item.replaceAll("-", " ")}</Button>)}</nav>
    {projects.isLoading ? <p className="mt-8 font-mono text-sm text-build-muted">Reading verified ecosystem records…</p> : rows.length === 0 ? <section className="mt-8 border-2 border-build-line p-10 text-center"><Box className="mx-auto size-10 text-build-cyan"/><h2 className="mt-4 font-build text-4xl">THE FIRST PROJECT BLOCK IS OPEN.</h2><p className="mt-2 text-build-muted">Sync a verified Sui repository to join the ecosystem.</p></section> : <section className="mt-8 grid gap-px border-2 border-build-line bg-build-line md:grid-cols-2 lg:grid-cols-3">{rows.map((project) => <article key={project.id} className="flex min-h-64 flex-col bg-build-panel p-5"><div className="flex items-start justify-between gap-3"><span className="font-mono text-[0.62rem] font-bold uppercase text-build-cyan">{project.category}</span>{project.package_count ? <span className="inline-flex items-center gap-1 font-mono text-[0.6rem] text-build-cyan"><ShieldCheck className="size-3"/>{project.package_count} PACKAGE</span> : null}</div><h2 className="mt-5 font-build text-3xl normal-case">{project.name}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-build-muted">{project.summary ?? "Verified Sui repository."}</p><div className="mt-5 grid grid-cols-2 gap-2 border-t border-build-line pt-4 font-mono text-xs"><span><small className="block text-build-muted">REPUTATION</small>{project.reputation_score.toLocaleString()}</span><span><small className="block text-build-muted">SUI RELEVANCE</small>{project.builder_repositories?.sui_relevance ?? 0}/100</span></div><div className="mt-5 flex items-center justify-between"><Link to="/builder/$username" params={{ username: project.builders?.github_username ?? "builder" }} className="font-mono text-xs hover:text-build-cyan">@{project.builders?.github_username}</Link><Link to="/ecosystem-project/$slug" params={{ slug: project.slug }} aria-label={`Explore ${project.name}`}><ArrowUpRight className="size-4"/></Link></div></article>)}</section>}
  </main></div>;
}