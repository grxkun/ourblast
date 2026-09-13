import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Building2, Code2, Flame, Github, LockKeyhole, Trophy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getBuilderLeaderboard } from "@/lib/build.functions";

type Metric = "builder" | "city" | "blast" | "rising" | "open-source";

const metrics: Array<{ key: Metric; label: string; icon: typeof Trophy }> = [
  { key: "builder", label: "Sui Builders", icon: Trophy },
  { key: "city", label: "Top Cities", icon: Building2 },
  { key: "blast", label: "BLAST", icon: LockKeyhole },
  { key: "rising", label: "Rising", icon: Flame },
  { key: "open-source", label: "Open Source", icon: Code2 },
];

export const Route = createFileRoute("/builders")({
  head: () => ({ meta: [
    { title: "Sui Builder Rankings — Blast Build" },
    { name: "description", content: "Explore verified Sui builders, repository cities, open-source activity, and Blast Build rankings." },
    { property: "og:title", content: "Sui Builder Rankings — Blast Build" },
    { property: "og:description", content: "Real Sui development becomes a public builder city and reputation score." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BuildersPage,
});

function metricValue(metric: Metric, row: { value: number }) {
  if (metric === "blast") return `${row.value.toLocaleString()} BLAST`;
  return row.value.toLocaleString();
}

function BuildersPage() {
  const [metric, setMetric] = useState<Metric>("builder");
  const fetchBoard = useServerFn(getBuilderLeaderboard);
  const board = useQuery({ queryKey: ["builder-leaderboard", metric], queryFn: () => fetchBoard({ data: { metric } }) });
  const rows = board.data ?? [];
  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg px-4 py-10 text-build-text lg:-mb-16 sm:py-16">
    <main className="mx-auto max-w-6xl">
      <header className="build-console relative overflow-hidden p-6 sm:p-10">
        <div className="build-blueprint absolute inset-0 opacity-30"/>
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div><p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-build-cyan">Global city atlas / live rankings</p><h1 className="mt-3 font-build text-[clamp(4rem,9vw,8rem)] leading-[0.82]">SUI BUILDERS</h1><p className="mt-5 max-w-2xl text-lg text-build-muted">Ranked by verified work—not wallet size. Explore the builders turning real Sui repositories into cities.</p></div>
          <Button asChild className="rounded-sm bg-build-cyan text-build-bg hover:bg-build-cyan/85"><Link to="/build"><Github/>Build your city</Link></Button>
        </div>
      </header>

      <section className="mt-10" aria-labelledby="rankings-title">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs font-bold text-build-cyan">PUBLIC LEDGER</p><h2 id="rankings-title" className="mt-2 font-build text-5xl">BUILDER RANKINGS</h2></div><div className="flex max-w-full gap-2 overflow-x-auto pb-2">{metrics.map(({ key, label, icon: Icon }) => <Button key={key} type="button" variant={metric === key ? "default" : "outline"} onClick={() => setMetric(key)} className={metric === key ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text hover:bg-build-panel-2"}><Icon/>{label}</Button>)}</div></div>
        <div className="mt-6 border-2 border-build-line bg-build-panel">
          {board.isLoading ? <p className="p-8 font-mono text-sm text-build-muted">Reading verified builder records…</p> : rows.length === 0 ? <div className="p-8 text-center sm:p-14"><p className="font-build text-4xl">THE FIRST BLOCK IS OPEN.</p><p className="mt-2 text-build-muted">Connect GitHub and become the first verified Sui city.</p></div> : <ol>{rows.map((row) => <li key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-build-line p-4 last:border-0 sm:grid-cols-[4rem_1fr_8rem_8rem_auto] sm:px-6"><span className="font-build text-3xl text-build-cyan">#{row.rank}</span><Link to="/builder/$username" params={{ username: row.username }} className="flex min-w-0 items-center gap-3"><img src={row.avatarUrl ?? ""} alt="" className="size-10 border border-build-line object-cover"/><span className="min-w-0"><strong className="block truncate font-build text-xl">@{row.username}</strong><small className="block font-mono text-[0.62rem] uppercase text-build-muted">{row.verifiedProjects} projects · level {row.builderLevel}</small></span></Link><span className="hidden font-mono text-xs text-build-muted sm:block">{row.commits.toLocaleString()} commits</span><span className="hidden font-mono text-xs text-build-muted sm:block">City L{row.cityLevel}</span><span className="flex items-center gap-2 font-build text-xl"><b>{metricValue(metric, row)}</b><ArrowUpRight className="size-4 text-build-cyan"/></span></li>)}</ol>}
        </div>
      </section>

      <section className="mt-14 border-t-2 border-build-line pt-8" aria-labelledby="map-title">
        <p className="font-mono text-xs font-bold text-build-cyan">FUTURE-READY / NO LOCATION REQUIRED</p><h2 id="map-title" className="mt-2 font-build text-5xl">SUI BUILDER MAP</h2>
        <div className="build-blueprint mt-6 grid min-h-72 grid-cols-2 gap-4 border-2 border-build-line bg-build-panel p-5 sm:grid-cols-4 lg:grid-cols-6">{rows.slice(0, 12).map((row, index) => <Link key={row.id} to="/builder/$username" params={{ username: row.username }} className="group flex min-h-24 flex-col justify-between border border-build-line bg-build-bg p-3 transition-transform hover:-translate-y-1 hover:border-build-cyan"><span className="font-mono text-[0.55rem] text-build-cyan">CITY_{String(index + 1).padStart(2, "0")}</span><span><strong className="block truncate font-build text-lg">@{row.username}</strong><small className="font-mono text-[0.55rem] text-build-muted">{row.tier.replaceAll("-", " ")} / L{row.cityLevel}</small></span></Link>)}</div>
      </section>
    </main>
  </div>;
}