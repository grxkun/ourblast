import { ImageIcon, Pencil, Rocket, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAUNCHPADS } from "@/lib/terminal/launchpad";
import type { LaunchConfiguration } from "@/lib/terminal/types";

export function LaunchCard({ launch, editing, onEdit, onChange, onLaunch, onGenerate }: {
  launch: LaunchConfiguration;
  editing: boolean;
  onEdit: () => void;
  onChange: (next: LaunchConfiguration) => void;
  onLaunch: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="terminal-launch-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 font-display text-lg uppercase"><Rocket className="size-4 text-primary" /> Token launch</span>
        <span className="font-body text-[0.65rem] font-bold uppercase text-muted-foreground">Ready to review</span>
      </div>
      <div className="space-y-4 p-4">
        {launch.image ? <img src={launch.image} alt={`${launch.name} token artwork`} className="aspect-square w-24 border-2 border-border object-cover" /> : null}
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Name<Input value={launch.name} maxLength={64} onChange={(event) => onChange({ ...launch, name: event.target.value })} className="mt-1" /></label>
            <label className="text-xs font-bold uppercase text-muted-foreground">Symbol<Input value={launch.symbol} maxLength={10} onChange={(event) => onChange({ ...launch, symbol: event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase() })} className="mt-1" /></label>
            <label className="text-xs font-bold uppercase text-muted-foreground sm:col-span-2">Description<Input value={launch.description} maxLength={280} onChange={(event) => onChange({ ...launch, description: event.target.value })} className="mt-1" /></label>
          </div>
        ) : (
          <div><h3 className="font-display text-3xl normal-case">{launch.name}</h3><p className="font-display text-xl text-primary">${launch.symbol}</p></div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">Launch pad</span>
          {LAUNCHPADS.map((pad) => (
            <Button
              key={pad.id}
              type="button"
              size="sm"
              variant={launch.launchpad === pad.label ? "default" : "outline"}
              onClick={() => onChange({ ...launch, launchpad: pad.label })}
            >
              {pad.label}
            </Button>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
          <dt className="text-muted-foreground">Network</dt><dd className="font-bold">Sui</dd>
          <dt className="text-muted-foreground">Launchpad</dt><dd className="font-bold">{launch.launchpad}</dd>
          <dt className="text-muted-foreground">Image</dt><dd className="font-bold">{launch.imageName ?? "Not provided"}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}><Pencil /> {editing ? "Done" : "Edit"}</Button>
          <Button type="button" variant="outline" onClick={onGenerate}><WandSparkles /> Generate image</Button>
          <Button type="button" onClick={onLaunch} className="ml-auto"><Rocket /> Launch</Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon className="size-3.5" /> Artwork can be attached from the command box.</p>
      </div>
    </div>
  );
}