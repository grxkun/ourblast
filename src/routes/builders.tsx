import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Building2, CalendarDays, Code2, Flame, Github, LockKeyhole, ShieldCheck, Trophy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { BuilderAtlas } from "@/components/build/BuilderAtlas";
import { getBuilderLeaderboard } from "@/lib/build.functions";

type Metric = "builder" | "city" | "blast" | "weekly" | "rising" | "open-source" | "reputation";

const metrics: Array<{ key: Metric; label: string; icon: typeof Trophy }> = [
  { key: "builder", label: "Sui Builders", icon: Trophy },
  { key: "city", label: "Top Cities", icon: Building2 },
  { key: "blast", label: "BLAST", icon: LockKeyhole },
  { key: "weekly", label: "Weekly", icon: CalendarDays },
  { key: "rising", label: "Rising", icon: Flame },
  { key: "open-source", label: "Open Source", icon: Code2 },
  { key: "reputation", label: "Sui Reputation", icon: ShieldCheck },
];

const suiCoreTeam = [
  { name: "Sam Blackshear", role: "Move creator / Sui core / Mysten Labs", github: "sblackshear", x: "b1ackd0g", district: "MOVE GENESIS" },
  { name: "François Garillot", role: "Sui protocol / distributed systems", github: "huitseeker", x: "huitseeker", district: "DISTRIBUTED SYSTEMS" },
  { name: "Kostas Chalkias", role: "Cryptography / Sui infrastructure", github: "kchalkias", x: "kostascrypto", district: "CRYPTOGRAPHY LAB" },
  { name: "Alberto Sonnino", role: "Consensus / cryptography / Sui research", github: "asonnino", x: "alberto_sonnino", district: "CONSENSUS WORKS" },
  { name: "Thomas Nowacki", role: "Move / compiler / Sui core", github: "tnowacki", x: null, district: "COMPILER QUARTER" },
  { name: "Marco Pitra", role: "Interest Protocol / Sui DeFi / Memez", github: "git-marcopitra", x: "marcopitra", district: "DEFI DISTRICT" },
  { name: "José Cerqueira", role: "Interest Protocol / Sui / Move", github: "josemvcerqueira", x: null, district: "MOVE FINANCE" },
  { name: "bmwill", role: "Sui core protocol / validator infrastructure", github: "bmwill", x: null, district: "VALIDATOR WORKS" },
  { name: "amnn", role: "Sui RPC / infrastructure", github: "amnn", x: null, district: "RPC GRID" },
  { name: "lxfind", role: "Sui execution / protocol engineering", github: "lxfind", x: null, district: "EXECUTION DISTRICT" },
  { name: "mystenmark", role: "Consensus / Sui protocol", github: "mystenmark", x: null, district: "CONSENSUS CORE" },
  { name: "mwtian", role: "Sui consensus / validator engineering", github: "mwtian", x: null, district: "VALIDATOR CORE" },
  { name: "Dario Russi", role: "Sui framework / Move / core engineering", github: "dariorussi", x: null, district: "FRAMEWORK FOUNDRY" },
  { name: "Joy Qiu", role: "Cryptography / zkLogin / Sui infrastructure", github: "joyqvq", x: null, district: "ZKLOGIN LAB" },
  { name: "Tzakian", role: "Move / compiler / tooling", github: "tzakian", x: null, district: "MOVE TOOLING" },
  { name: "Jonas Lind", role: "Cryptography / Sui infrastructure", github: "jonas-lj", x: null, district: "CRYPTO SYSTEMS" },
  { name: "Stefan", role: "Sui infrastructure / developer tooling", github: "stefan-mysten", x: null, district: "DEVTOOLS YARD" },
  { name: "Evan Wall", role: "Sui data / indexing / infrastructure", github: "evan-wall-mysten", x: null, district: "DATA INDEX" },
  { name: "Randall", role: "Sui protocol / consensus", github: "randall-Mysten", x: null, district: "PROTOCOL CORE" },
  { name: "Christophe", role: "Move / compiler / Sui tooling", github: "chrstphe", x: null, district: "COMPILER WORKS" },
] as const;

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
          <div className="flex flex-wrap gap-2"><Button asChild className="rounded-sm bg-build-cyan text-build-bg hover:bg-build-cyan/85"><Link to="/build"><Github/>Build your city</Link></Button><Button asChild variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Link to="/ecosystem">Ecosystem <ArrowUpRight/></Link></Button></div>
        </div>
      </header>

      <section className="mt-10" aria-labelledby="rankings-title">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs font-bold text-build-cyan">PUBLIC LEDGER</p><h2 id="rankings-title" className="mt-2 font-build text-5xl">BUILDER RANKINGS</h2></div><div className="flex max-w-full gap-2 overflow-x-auto pb-2">{metrics.map(({ key, label, icon: Icon }) => <Button key={key} type="button" variant={metric === key ? "default" : "outline"} onClick={() => setMetric(key)} className={metric === key ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text hover:bg-build-panel-2"}><Icon/>{label}</Button>)}</div></div>
         <p className="mt-4 max-w-3xl font-mono text-[0.65rem] uppercase text-build-muted">Weekly counts verified activity in the last 7 days. Rising adds recent verified package momentum. Sui Reputation combines code, packages, and earned achievements. BLAST never changes Builder Power.</p><div className="mt-4 border-2 border-build-line bg-build-panel">
          {board.isLoading ? <p className="p-8 font-mono text-sm text-build-muted">Reading verified builder records…</p> : rows.length === 0 ? <div className="p-8 text-center sm:p-14"><p className="font-build text-4xl">THE FIRST BLOCK IS OPEN.</p><p className="mt-2 text-build-muted">Connect GitHub and become the first verified Sui city.</p></div> : <ol>{rows.map((row) => <li key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-build-line p-4 last:border-0 sm:grid-cols-[4rem_1fr_8rem_8rem_auto] sm:px-6"><span className="font-build text-3xl text-build-cyan">#{row.rank}</span><Link to="/builder/$username" params={{ username: row.username }} className="flex min-w-0 items-center gap-3"><img src={row.avatarUrl ?? ""} alt="" className="size-10 border border-build-line object-cover"/><span className="min-w-0"><strong className="block truncate font-build text-xl">@{row.username}</strong><small className="block font-mono text-[0.62rem] uppercase text-build-muted">{row.verifiedProjects} projects · level {row.builderLevel}</small></span></Link><span className="hidden font-mono text-xs text-build-muted sm:block">{row.commits.toLocaleString()} commits</span><span className="hidden font-mono text-xs text-build-muted sm:block">City L{row.cityLevel}</span><span className="flex items-center gap-2 font-build text-xl"><b>{metricValue(metric, row)}</b><ArrowUpRight className="size-4 text-build-cyan"/></span></li>)}</ol>}
        </div>
      </section>

      <section className="mt-14 border-t-2 border-build-line pt-8" aria-labelledby="core-team-title">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs font-bold text-build-cyan">CURATED ECOSYSTEM / NO SIGN-IN REQUIRED</p>
            <h2 id="core-team-title" className="mt-2 font-build text-4xl sm:text-5xl">SUI CORE TEAM CITIES</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-build-muted">A recognition map for the people building Sui. These honorary cities are separate from community rankings and are not scored by Blast Build.</p>
        </div>
        <div className="build-blueprint mt-6 grid gap-4 border-2 border-build-line bg-build-panel p-4 sm:grid-cols-2 lg:grid-cols-5">
          {suiCoreTeam.map((member, index) => (
            <article key={member.github} className="group flex min-h-72 flex-col border-2 border-build-line bg-build-bg transition-transform hover:-translate-y-1">
              <div className="relative flex h-32 items-end justify-center overflow-hidden border-b-2 border-build-line bg-build-panel-2 p-3">
                <span className="absolute left-3 top-3 font-mono text-[0.58rem] font-bold text-build-cyan">CORE_{String(index + 1).padStart(2, "0")}</span>
                <div className="flex items-end gap-1.5" aria-hidden="true">
                  <span className="h-10 w-7 border-2 border-build-line bg-build-bg" />
                  <span className="flex h-20 w-12 items-center justify-center border-2 border-build-line bg-build-cyan text-build-bg"><Building2 className="size-6" /></span>
                  <span className="h-14 w-8 border-2 border-build-line bg-build-bg" />
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-mono text-[0.58rem] font-bold text-build-cyan">{member.district}</p>
                <h3 className="mt-2 font-build text-2xl normal-case">{member.name}</h3>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-build-muted">{member.role}</p>
                <div className="mt-4 flex gap-2 border-t border-build-line pt-3">
                  <a href={`https://github.com/${member.github}`} target="_blank" rel="noreferrer" aria-label={`${member.name} on GitHub`} className="inline-flex items-center gap-1.5 font-mono text-xs font-bold hover:text-build-cyan"><Github className="size-4" />@{member.github}</a>
                  {member.x ? <a href={`https://x.com/${member.x}`} target="_blank" rel="noreferrer" aria-label={`${member.name} on X`} className="ml-auto font-mono text-xs font-bold hover:text-build-cyan">X ↗</a> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 border-t-2 border-build-line pt-8" aria-labelledby="map-title">
        <p className="font-mono text-xs font-bold text-build-cyan">FUTURE-READY / NO LOCATION REQUIRED</p><h2 id="map-title" className="mt-2 font-build text-5xl">SUI BUILDER MAP</h2>
         <BuilderAtlas builders={rows}/>
         <div className="mt-4 flex justify-end"><Button asChild variant="outline" className="rounded-sm border-build-line bg-transparent text-build-text"><Link to="/community-city"><Building2/>Open global city</Link></Button></div>
      </section>
    </main>
  </div>;
}