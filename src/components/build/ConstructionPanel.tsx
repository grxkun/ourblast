import { Building2, Check, Hammer, LockKeyhole, Map, ShieldCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { BLAST_BUILD, buildingUpgradePreview } from "@/lib/blast-build.config";
import { previewBlastCommitment } from "@/lib/build.functions";

type Project = {
  id: string;
  name: string;
  building_type: string;
  building_level: number;
  commits: number;
  pull_requests: number;
  contributors: number;
};

export function ConstructionPanel({ projects, blastBalance, freeLand, expandedLand }: {
  projects: Project[];
  blastBalance: number;
  freeLand: number;
  expandedLand: number;
}) {
  const [mode, setMode] = useState<"building" | "land">("building");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [amount, setAmount] = useState(100);
  const savePreview = useServerFn(previewBlastCommitment);
  const previewMutation = useMutation({
    mutationFn: () => savePreview({ data: { amount, purpose: mode } }),
    onSuccess: () => toast.info("Preview saved", { description: "No BLAST moved. Mainnet construction requires the reversible lock contract." }),
    onError: (error) => toast.error("Preview could not be saved", { description: error.message }),
  });
  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const preview = useMemo(() => buildingUpgradePreview(project?.building_level ?? 1, amount), [project, amount]);
  const expansion = [...BLAST_BUILD.expansionTiers].reverse().find((tier) => amount >= tier.blast) ?? null;
  const insufficient = amount > blastBalance;

  return <section className="mt-12 border-2 border-build-line bg-build-panel" aria-labelledby="construction-title">
    <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
      <div className="border-b border-build-line p-5 sm:p-7 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-build-cyan"><Hammer className="size-4"/>OPTIONAL BLAST EXPANSION</div>
        <h2 id="construction-title" className="mt-3 font-build text-4xl normal-case">Construction preview</h2>
        <p className="mt-3 text-sm leading-relaxed text-build-muted">Your code built the foundation. BLAST can add space and visual upgrades without changing your Builder Power.</p>
        <div className="mt-6 grid grid-cols-2 gap-px border border-build-line bg-build-line font-mono text-xs">
          <div className="bg-build-bg p-4"><span className="text-build-muted">FREE LAND</span><strong className="mt-1 block text-2xl text-build-text">{freeLand}</strong></div>
          <div className="bg-build-bg p-4"><span className="text-build-muted">EXPANDED</span><strong className="mt-1 block text-2xl text-build-text">+{expandedLand}</strong></div>
        </div>
        <div className="mt-5 border border-build-cyan bg-build-cyan/10 p-4 text-xs leading-relaxed text-build-text">
          <p className="flex items-center gap-2 font-mono font-bold text-build-cyan"><ShieldCheck className="size-4"/>PREVIEW MODE — NO FUNDS MOVE</p>
          <p className="mt-2">Construction stays disabled until a reversible BLAST lock contract is deployed and verified.</p>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Construction type">
          <Button type="button" variant={mode === "building" ? "default" : "outline"} onClick={() => setMode("building")} className={mode === "building" ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text"}><Building2/>Building</Button>
          <Button type="button" variant={mode === "land" ? "default" : "outline"} onClick={() => setMode("land")} className={mode === "land" ? "rounded-sm bg-build-cyan text-build-bg" : "rounded-sm border-build-line bg-transparent text-build-text"}><Map/>Land</Button>
        </div>

        {mode === "building" ? <div className="mt-6">
          <label htmlFor="construction-project" className="font-mono text-[0.65rem] font-bold uppercase text-build-muted">Verified repository building</label>
          <select id="construction-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 h-11 w-full border border-build-line bg-build-bg px-3 font-mono text-sm text-build-text focus:outline-none focus:ring-2 focus:ring-build-cyan" disabled={!projects.length}>
            {projects.length ? projects.map((item) => <option key={item.id} value={item.id}>{item.name} — developer level {item.building_level}</option>) : <option>No verified building yet</option>}
          </select>
        </div> : <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {BLAST_BUILD.expansionTiers.map((tier) => <button type="button" key={tier.key} onClick={() => setAmount(tier.blast)} className="border border-build-line bg-build-bg p-3 text-left transition-colors hover:border-build-cyan"><span className="block font-mono text-[0.6rem] text-build-cyan">+{tier.plots} PLOTS</span><strong className="mt-1 block font-build text-xl normal-case">{tier.blast.toLocaleString()} BLAST</strong></button>)}
        </div>}

        <div className="mt-6">
          <div className="flex items-center justify-between font-mono text-xs"><label htmlFor="blast-amount">BLAST TO COMMIT</label><span className="text-build-muted">Balance {blastBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
          <Slider className="mt-4" min={100} max={5_000} step={50} value={[amount]} onValueChange={(value) => setAmount(value[0] ?? 100)}/>
          <div className="mt-3 flex items-center gap-2"><Input id="blast-amount" type="number" min={100} max={5_000} step={50} value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))} className="h-11 rounded-none border-build-line bg-build-bg font-mono"/><span className="font-build text-xl">BLAST</span></div>
        </div>

        <div className="mt-6 border-y border-build-line py-5">
          {mode === "building" ? <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><span className="font-mono text-[0.62rem] text-build-muted">DEVELOPER LEVEL</span><strong className="mt-1 block font-build text-4xl">{preview.developerLevel}</strong></div><span className="text-build-cyan">→</span><div><span className="font-mono text-[0.62rem] text-build-muted">DISPLAY LEVEL</span><strong className="mt-1 block font-build text-4xl text-build-cyan">{preview.displayLevel}</strong></div></div>
            : <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div><span className="font-mono text-[0.62rem] text-build-muted">CURRENT LAND</span><strong className="mt-1 block font-build text-4xl">{freeLand + expandedLand}</strong></div><span className="text-build-cyan">→</span><div><span className="font-mono text-[0.62rem] text-build-muted">PREVIEW LAND</span><strong className="mt-1 block font-build text-4xl text-build-cyan">{freeLand + expandedLand + (expansion?.plots ?? 0)}</strong></div></div>}
          <p className="mt-4 text-center font-mono text-[0.62rem] text-build-muted">Builder Power stays unchanged <Check className="inline size-3 text-build-cyan"/></p>
        </div>

        {insufficient ? <p className="mt-4 font-mono text-xs text-destructive">This preview exceeds your current BLAST balance.</p> : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" disabled={!projects.length && mode === "building" || previewMutation.isPending} onClick={() => previewMutation.mutate()} className="h-12 rounded-sm border-build-cyan bg-transparent text-build-text hover:bg-build-cyan/10">{previewMutation.isPending ? "Saving…" : "Save preview"}</Button>
          <Button disabled className="h-12 rounded-sm bg-build-cyan text-build-bg"><LockKeyhole/>Confirm locked</Button>
        </div>
      </div>
    </div>
  </section>;
}