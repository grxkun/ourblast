import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Box, Github, ShieldCheck } from "lucide-react";

import { getEcosystemProject } from "@/lib/ecosystem.functions";

export const Route = createFileRoute("/ecosystem-project/$slug")({
  loader: async ({ params }) => { const project = await getEcosystemProject({ data: { slug: params.slug } }); if (!project) throw notFound(); return project; },
  head: ({ loaderData }) => ({ meta: [
    { title: loaderData ? `${loaderData.name} — Verified Sui Project` : "Sui Project Unavailable" },
    { name: "description", content: loaderData?.summary ?? "Verified Sui ecosystem project and on-chain package evidence." },
    { property: "og:title", content: loaderData ? `${loaderData.name} — Blast Build` : "Sui Project Unavailable" },
    { property: "og:description", content: loaderData?.summary ?? "Verified Sui ecosystem project and on-chain package evidence." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProjectPage,
  notFoundComponent: () => <main className="theme-build flex min-h-[70vh] flex-col items-center justify-center bg-build-bg px-6 text-center text-build-text"><Box className="size-10 text-build-cyan"/><h1 className="mt-4 font-build text-5xl">PROJECT NOT FOUND</h1><Link to="/ecosystem" className="mt-5 text-build-cyan">Back to ecosystem</Link></main>,
});

function ProjectPage() {
  const project = Route.useLoaderData();
  const repo = project.builder_repositories;
  const packages = project.builder_sui_packages ?? [];
  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg px-4 py-10 text-build-text lg:-mb-16"><main className="mx-auto max-w-5xl">
    <Link to="/ecosystem" className="inline-flex items-center gap-2 font-mono text-xs text-build-muted hover:text-build-cyan"><ArrowLeft className="size-4"/>Ecosystem</Link>
    <header className="mt-6 border-b-2 border-build-line pb-8"><p className="font-mono text-xs font-bold uppercase text-build-cyan">{project.category} / VERIFIED SUI PROJECT</p><h1 className="mt-3 font-build text-6xl sm:text-8xl">{project.name}</h1><p className="mt-5 max-w-2xl text-lg text-build-muted">{project.summary ?? "Verified Sui repository."}</p><div className="mt-6 flex flex-wrap gap-4 font-mono text-xs"><Link to="/builder/$username" params={{ username: project.builders?.github_username ?? "builder" }}>@{project.builders?.github_username} →</Link>{repo?.html_url ? <a href={repo.html_url} target="_blank" rel="noreferrer" className="inline-flex gap-2"><Github className="size-4"/>Repository</a> : null}</div></header>
    <section className="grid gap-px border-b border-build-line bg-build-line sm:grid-cols-4">{[["PROJECT REPUTATION", project.reputation_score], ["SUI RELEVANCE", repo?.sui_relevance ?? 0], ["DEVELOPER LEVEL", repo?.building_level ?? 1], ["VERIFIED PACKAGES", project.package_count]].map(([label, value]) => <div key={label} className="bg-build-panel p-5"><p className="font-mono text-[0.6rem] text-build-muted">{label}</p><strong className="mt-2 block font-build text-3xl text-build-cyan">{Number(value).toLocaleString()}</strong></div>)}</section>
    <section className="mt-12"><p className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><ShieldCheck className="size-4"/>ONCHAIN PACKAGE EVIDENCE</p>{packages.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{packages.map((pkg) => <article key={pkg.package_id} className="border border-build-line bg-build-panel p-4"><strong className="break-all font-mono text-xs">{pkg.package_id}</strong><p className="mt-3 font-mono text-[0.62rem] text-build-muted">VERSION {pkg.package_version} · {pkg.module_count} MODULES · {pkg.verification_source.toUpperCase()}</p></article>)}</div> : <p className="mt-4 text-build-muted">The repository is verified as Sui code; no wallet-owned mainnet package is linked yet.</p>}</section>
  </main></div>;
}