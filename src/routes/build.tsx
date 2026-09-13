import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Award, CheckCircle2, Github, RefreshCw, Sparkles, WalletCards, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BuilderCity } from "@/components/build/BuilderCity";
import { CityShareCard } from "@/components/build/CityShareCard";
import { ConstructionPanel } from "@/components/build/ConstructionPanel";
import { useBlast } from "@/components/blast/session";
import { Button } from "@/components/ui/button";
import { completeGitHubConnect, getBuilderWalletAssets, getMyBuilder, startGitHubConnect, syncGitHub } from "@/lib/build.functions";

export const Route = createFileRoute("/build")({
  head: () => ({ meta: [
    { title: "Blast Build — Build Your Sui City" },
    { name: "description", content: "Connect GitHub, verify real Sui development, and turn your repositories into a living Builder City." },
    { property: "og:title", content: "Blast Build — Build Your Sui City" },
    { property: "og:description", content: "Your code becomes your city. GitHub proves you build. Sui proves you ship." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BlastBuild,
});

function waitForGitHub(popup: Window) {
  return new Promise<string>((resolve, reject) => {
    let timer: number | undefined;
    const cleanup = () => { window.removeEventListener("message", listener); if (timer) window.clearInterval(timer); };
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.connectorId !== "github") return;
      cleanup();
      if (event.data?.type === "appUserConnectorOAuthComplete" && typeof event.data?.code === "string") resolve(event.data.code);
      else reject(new Error("GitHub connection was not completed."));
    };
    window.addEventListener("message", listener);
    timer = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("GitHub window closed before completion.")); } }, 500);
  });
}

function BlastBuild() {
  const { userId, profile, connect, connecting } = useBlast();
  const queryClient = useQueryClient();
  const getBuilder = useServerFn(getMyBuilder);
  const getWalletAssets = useServerFn(getBuilderWalletAssets);
  const startConnect = useServerFn(startGitHubConnect);
  const completeConnect = useServerFn(completeGitHubConnect);
  const sync = useServerFn(syncGitHub);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const builder = useQuery({ queryKey: ["blast-build", userId], queryFn: () => getBuilder(), enabled: Boolean(userId) });
  const walletAssets = useQuery({ queryKey: ["blast-build-wallet", userId], queryFn: () => getWalletAssets(), enabled: Boolean(userId), staleTime: 30_000 });
  const repositories = (builder.data?.builder_repositories ?? []).slice().sort((a, b) => b.sui_relevance - a.sui_relevance);
  const city = builder.data?.builder_cities;
  const verifiedRepositories = repositories.filter((repo) => repo.verified);
  const districts = city?.city_districts ?? [];
  const events = (city?.city_events ?? []).slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  const badges = builder.data?.builder_badges ?? [];
  const packages = builder.data?.builder_sui_packages ?? [];
  const achievements = builder.data?.builder_achievements ?? [];
  const cityBuildings = repositories.filter((repo) => repo.verified).map((repo, index) => ({
    id: `building-${repo.id}`, building_type: repo.building_type, building_level: repo.building_level,
    district_key: repo.building_type, position_x: index % 4, position_y: Math.floor(index / 4),
    builder_repositories: { name: repo.name, sui_relevance: repo.sui_relevance, description: repo.description },
  }));

  const githubMutation = useMutation({ mutationFn: async () => {
    const popup = window.open("", "blast-build-github", "width=600,height=720");
    if (!popup) throw new Error("Allow popups, then try connecting GitHub again.");
    try {
      const { authorizationUrl } = await startConnect();
      const completion = waitForGitHub(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      await completeConnect({ data: { code } });
      setSyncNote("GitHub connected. Analyzing your public Sui repositories…");
      const result = await sync();
      if (result.connected) setSyncNote(`${result.verified} of ${result.analyzed} repositories verified for your city.`);
    } catch (error) { popup.close(); throw error; }
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["blast-build", userId] }); toast.success("Builder City generated"); }, onError: (error) => toast.error("GitHub connection failed", { description: error.message }) });

  const syncMutation = useMutation({ mutationFn: () => sync(), onSuccess: async (result) => {
    if (result.connected) setSyncNote(`${result.verified} of ${result.analyzed} repositories verified.`);
    await queryClient.invalidateQueries({ queryKey: ["blast-build", userId] });
  }, onError: (error) => toast.error("Sync failed", { description: error.message }) });

  return <div className="theme-build -mx-4 -mt-6 min-h-screen bg-build-bg text-build-text lg:-mb-16">
    <section className="relative overflow-hidden border-b border-build-line px-4 py-10 sm:py-16">
      <div className="build-blueprint absolute inset-0 opacity-30" />
      <div className="build-console relative mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-build-line pb-4 font-mono text-[0.65rem] font-bold uppercase tracking-[0.16em] text-build-muted">
          <span className="inline-flex items-center gap-2 text-build-cyan"><span className="build-status-dot"/>Builder network live</span>
          <span>OURBLAST / SUI BUILDER PROTOCOL / V1.0</span>
        </div>
        <div className="grid items-end gap-8 py-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-build-cyan uppercase">GitHub × Sui × City Builder</p>
            <h1 className="mt-4 font-build text-[clamp(4rem,10vw,8.5rem)] leading-[0.78]">BUILD YOUR<br/><span className="text-build-cyan">SUI CITY.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-build-muted">Your GitHub code builds your free city. Your verified Sui activity grows it. BLAST is optional expansion—not developer reputation.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            {!userId ? <Button size="lg" onClick={() => void connect()} disabled={connecting} className="h-12 rounded-sm bg-build-cyan px-6 text-build-bg hover:bg-build-cyan/85"><WalletCards />{connecting ? "Connecting…" : "1. Connect Sui Wallet"}</Button>
              : !builder.data?.github_connected ? <Button size="lg" onClick={() => githubMutation.mutate()} disabled={githubMutation.isPending} className="h-12 rounded-sm bg-build-cyan px-6 text-build-bg hover:bg-build-cyan/85"><Github />{githubMutation.isPending ? "Building your city…" : "2. Connect GitHub"}</Button>
              : <Button size="lg" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="h-12 rounded-sm bg-build-cyan px-6 text-build-bg hover:bg-build-cyan/85"><RefreshCw className={syncMutation.isPending ? "animate-spin" : ""}/>{syncMutation.isPending ? "Analyzing…" : "Sync GitHub"}</Button>}
            <Button asChild size="lg" variant="outline" className="h-12 rounded-sm border-build-line bg-transparent px-6 text-build-text hover:bg-build-panel-2"><Link to="/builders">Explore Sui builders <ArrowRight className="size-4"/></Link></Button>
          </div>
        </div>
        <div className="grid gap-6 border-t border-build-line pt-8 lg:grid-cols-[1.35fr_.65fr]">
           <BuilderCity buildings={cityBuildings} username={builder.data?.github_username ?? "builder"} level={city?.city_level ?? builder.data?.builder_level ?? 1} {...(builder.data?.github_username ? { profileHref: `/builder/${builder.data.github_username}` } : {})}/>
          <div className="grid content-start gap-px border border-build-line bg-build-line sm:grid-cols-3 lg:grid-cols-1">
            {[
               ["01 / WALLET", "Connect your Sui wallet", "Slush opens as your Sui wallet provider. This creates your player identity."],
               ["02 / CODE", "Then connect GitHub", "Public repositories and strong Sui-specific evidence create city buildings."],
              ["03 / GROWTH", "Your free city grows", "Real development grows buildings and Builder Power. Optional BLAST only expands the city."],
            ].map(([n, title, text]) => <div key={n} className="bg-build-panel p-5"><p className="font-mono text-[0.62rem] font-bold text-build-cyan">{n}</p><h2 className="mt-5 font-build text-2xl">{title}</h2><p className="mt-2 text-sm leading-relaxed text-build-muted">{text}</p></div>)}
          </div>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-3 border-t border-build-line pt-4 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-build-muted sm:flex-row">
          <span>Relevance threshold: 60 / 100</span><span className="text-build-cyan">System status: verification active</span>
        </div>
        <div>
          {userId ? <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs text-build-muted"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-build-cyan"/>Sui wallet verified</span>{builder.data?.github_connected ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-build-cyan"/>GitHub connected</span> : null}<span className="truncate">{profile?.wallet_address}</span></div> : null}
          {syncNote ? <p className="mt-4 font-mono text-xs text-build-cyan">{syncNote}</p> : null}
        </div>
      </div>
    </section>

    <section id="explore" className="mx-auto max-w-6xl px-4 py-12">
      {builder.data?.github_connected ? <>
        <div className="grid gap-px border border-build-line bg-build-line sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Builder Power", (city?.builder_power ?? builder.data.builder_score).toLocaleString()], ["Sui Reputation", builder.data.sui_reputation_score.toLocaleString()],
            ["City Power", (city?.city_power ?? 0).toLocaleString()], ["Sui projects", builder.data.verified_repository_count],
            ["Verified packages", builder.data.verified_package_count], ["Free land", city?.free_land ?? Math.max(6, builder.data.verified_repository_count + 4)],
            ["City level", city?.city_level ?? builder.data.builder_level], ["BLAST", (walletAssets.data?.blast ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })],
          ].map(([label, value]) => <div key={label} className="bg-build-panel p-5"><p className="font-mono text-[0.62rem] tracking-[0.15em] text-build-muted uppercase">{label}</p><p className="mt-2 font-build text-3xl font-bold">{value}</p></div>)}
        </div>
        <div className="mt-12 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs text-build-cyan uppercase">Verification ledger</p><h2 className="mt-2 font-build text-4xl font-bold normal-case">Your Sui projects</h2></div>{builder.data.github_username ? <Link to="/builder/$username" params={{ username: builder.data.github_username }} className="font-mono text-sm text-build-cyan hover:underline">View public profile →</Link> : null}</div>
         <div className="mt-6 grid gap-4 lg:grid-cols-2">{repositories.map((repo) => <article key={repo.id} className="border border-build-line bg-build-panel p-5">
          <div className="flex items-start justify-between gap-4"><div><a href={repo.html_url} target="_blank" rel="noreferrer" className="font-build text-xl font-bold hover:text-build-cyan">{repo.name}</a><p className="mt-1 line-clamp-2 text-sm text-build-muted">{repo.description ?? "No repository description."}</p></div><span className={repo.verified ? "border border-build-cyan bg-build-cyan/10 px-2 py-1 font-mono text-xs text-build-cyan" : "border border-build-line px-2 py-1 font-mono text-xs text-build-muted"}>{repo.verified ? "VERIFIED" : "NOT VERIFIED"}</span></div>
          <div className="mt-5"><div className="flex justify-between font-mono text-xs"><span>SUI RELEVANCE</span><b>{repo.sui_relevance}/100</b></div><div className="mt-2 h-2 bg-build-line"><div className="h-full bg-build-cyan" style={{ width: `${repo.sui_relevance}%` }}/></div></div>
          <div className="mt-4 flex flex-wrap gap-2">{repo.repository_signals.map((signal) => <span key={signal.id} title={signal.evidence ?? undefined} className="border border-build-line px-2 py-1 font-mono text-[0.65rem] text-build-muted">✓ {signal.label}</span>)}</div>
           <div className="mt-5 grid grid-cols-4 gap-2 border-t border-build-line pt-4 text-center font-mono text-xs text-build-muted"><span><b className="block text-build-text">{repo.commits}</b>commits</span><span><b className="block text-build-text">{repo.pull_requests}</b>PRs</span><span><b className="block text-build-text">{repo.contributors}</b>people</span><span><b className="block text-build-text">L{repo.building_level}</b>developer</span></div>
        </article>)}</div>
         <section className="mt-12 grid gap-px border border-build-line bg-build-line lg:grid-cols-3" aria-label="City progress">
           <div className="bg-build-panel p-5"><p className="font-mono text-xs font-bold text-build-cyan">GENERATED DISTRICTS</p><div className="mt-4 flex flex-wrap gap-2">{districts.length ? districts.map((district) => <span key={district.id} className="border border-build-line px-2 py-1 font-mono text-[0.65rem] uppercase">{district.label} · {district.repository_count}</span>) : <span className="text-sm text-build-muted">Sync GitHub to map your project districts.</span>}</div></div>
           <div className="bg-build-panel p-5"><p className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><Award className="size-4"/>VERIFIED BADGES</p><div className="mt-4 space-y-3">{badges.length ? badges.map((badge) => <div key={badge.id}><strong className="font-build text-xl normal-case">{badge.label}</strong><p className="text-xs text-build-muted">{badge.evidence}</p></div>) : <span className="text-sm text-build-muted">Badges appear after your next verified sync.</span>}</div></div>
           <div className="bg-build-panel p-5"><p className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><Zap className="size-4"/>CITY EVENTS</p><div className="mt-4 space-y-3">{events.length ? events.slice(0, 4).map((event) => <div key={event.id}><strong className="block text-sm">{event.title}</strong><span className="font-mono text-[0.62rem] text-build-muted">{new Date(event.occurred_at).toLocaleDateString()}</span></div>) : <span className="text-sm text-build-muted">New verified activity will bring your city to life.</span>}</div></div>
         </section>
         <ConstructionPanel projects={verifiedRepositories} blastBalance={walletAssets.data?.blast ?? 0} freeLand={city?.free_land ?? Math.max(6, builder.data.verified_repository_count + 4)} expandedLand={city?.expanded_land ?? 0}/>
         <section className="mt-12 grid gap-6 lg:grid-cols-2">
           <div className="border-t-2 border-build-line pt-5"><p className="font-mono text-xs font-bold text-build-cyan">VERIFIED SUI PACKAGES</p><div className="mt-4 space-y-2">{packages.length ? packages.map((pkg) => <div key={pkg.id} className="border border-build-line bg-build-panel p-4"><div className="flex justify-between gap-3"><strong className="font-mono text-sm">{pkg.package_id.slice(0, 12)}…{pkg.package_id.slice(-6)}</strong><span className="font-mono text-[0.6rem] text-build-cyan">ONCHAIN VERIFIED</span></div><p className="mt-2 text-xs text-build-muted">{pkg.module_count} modules · {pkg.verification_source} evidence · mainnet</p></div>) : <p className="text-sm text-build-muted">Sync checks your wallet history and repository evidence for published Move packages.</p>}</div></div>
           <div className="border-t-2 border-build-line pt-5"><p className="font-mono text-xs font-bold text-build-cyan">BUILDER ACHIEVEMENTS</p><div className="mt-4 space-y-3">{achievements.map((achievement) => <div key={achievement.id}><div className="flex justify-between gap-3 text-sm"><strong>{achievement.label}</strong><span className={achievement.earned_at ? "font-mono text-xs text-build-cyan" : "font-mono text-xs text-build-muted"}>{achievement.earned_at ? "EARNED" : `${Math.min(achievement.progress, achievement.target)}/${achievement.target}`}</span></div><div className="mt-2 h-1.5 bg-build-line"><div className="h-full bg-build-cyan" style={{ width: `${Math.min(100, achievement.progress / achievement.target * 100)}%` }}/></div></div>)}</div></div>
         </section>
         {builder.data.github_username ? <div className="mt-12"><CityShareCard username={builder.data.github_username} cityLevel={city?.city_level ?? builder.data.builder_level} builderPower={city?.builder_power ?? builder.data.builder_score} projects={builder.data.verified_repository_count} commits={builder.data.total_commits} packages={builder.data.verified_package_count}/></div> : null}
      </> : <div className="grid gap-8 lg:grid-cols-3">
         {[{ icon: WalletCards, n: "01", title: "Connect your Sui wallet", text: "Slush opens as your wallet provider and creates your player identity." },{ icon: Github, n: "02", title: "Then connect GitHub", text: "We inspect public code, dependencies and contribution quality—not repository names alone." },{ icon: Sparkles, n: "03", title: "Your city grows", text: "Every verified Sui repository becomes a building sized by real development activity." }].map(({icon: Icon,n,title,text}) => <article key={n} className="border-t border-build-line pt-5"><div className="flex items-center justify-between"><Icon className="size-6 text-build-cyan"/><span className="font-mono text-xs text-build-muted">{n}</span></div><h2 className="mt-8 font-build text-2xl font-bold normal-case">{title}</h2><p className="mt-3 text-sm leading-relaxed text-build-muted">{text}</p></article>)}
      </div>}
    </section>
  </div>;
}
