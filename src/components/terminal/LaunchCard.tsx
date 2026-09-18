import { ImageIcon, Pencil, Rocket, WandSparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CREATOR_FEE_ROUTES, GAS_NOTE_TERMINAL, LAUNCHER_SHARE_USES, LAUNCH_FEE_SUI } from "@/lib/terminal/fees";
import { X_BOT_HANDLE } from "@/lib/terminal/x-bot";
import { LAUNCHPADS, resolveLaunchpad } from "@/lib/terminal/launchpad";
import { normalizeLaunchConfig } from "@/lib/terminal/launchSettings";
import type { LaunchConfiguration } from "@/lib/terminal/types";

export function LaunchCard({ launch, editing, onEdit, onChange, onLaunch, onGenerate }: {
  launch: LaunchConfiguration;
  editing: boolean;
  onEdit: () => void;
  onChange: (next: LaunchConfiguration) => void;
  onLaunch: () => void;
  onGenerate: () => void;
}) {
  const activePad = resolveLaunchpad(launch.launchpad);
  const [notes, setNotes] = useState<string[]>([]);

  /** Keeps typing free-form; the pad's real limits are applied when the field loses focus. */
  const apply = (next: LaunchConfiguration) => {
    const normalized = normalizeLaunchConfig(next);
    setNotes(normalized.notes);
    onChange(normalized.config);
  };
  const draft = (next: LaunchConfiguration) => onChange(next);
  const settle = () => apply(launch);

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
              onClick={() => apply({ ...launch, launchpad: pad.label })}
            >
              {pad.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">LP pairing</span>
          {activePad.supportsCustomPair ? (
            activePad.pairTokens.map((token) => (
              <Button
                key={token}
                type="button"
                size="sm"
                variant={launch.pairToken === token ? "default" : "outline"}
                onClick={() => apply({ ...launch, pairToken: token })}
              >
                ${token}
              </Button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">{activePad.label} pairs every launch against ${activePad.pairTokens[0] ?? "SUI"}.</span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Starting LP (${launch.pairToken})
            <Input
              inputMode="decimal"
              value={String(launch.liquidity)}
              onChange={(event) => draft({ ...launch, liquidity: Number(event.target.value.replace(/[^0-9.]/g, "")) || 0 })}
              onBlur={settle}
              className="mt-1"
            />
            <span className="mt-1 block font-body text-[0.65rem] normal-case text-muted-foreground">{activePad.liquidity.min}–{activePad.liquidity.max}</span>
          </label>
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Dev buy (${launch.pairToken})
            <Input
              inputMode="decimal"
              value={String(launch.devBuy)}
              onChange={(event) => draft({ ...launch, devBuy: Number(event.target.value.replace(/[^0-9.]/g, "")) || 0 })}
              onBlur={settle}
              className="mt-1"
            />
            <span className="mt-1 block font-body text-[0.65rem] normal-case text-muted-foreground">0 = no first buy</span>
          </label>
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Token supply
            <Input
              inputMode="numeric"
              value={String(launch.totalSupply)}
              onChange={(event) => draft({ ...launch, totalSupply: Number(event.target.value.replace(/[^0-9]/g, "")) || 0 })}
              onBlur={settle}
              className="mt-1"
            />
            <span className="mt-1 block font-body text-[0.65rem] normal-case text-muted-foreground">{activePad.supply.min.toLocaleString()}–{activePad.supply.max.toLocaleString()}</span>
          </label>
        </div>
        {notes.length ? (
          <ul className="space-y-1 border-l-2 border-primary pl-3 text-xs text-muted-foreground">
            {notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-3 text-sm">
          <dt className="text-muted-foreground">Network</dt><dd className="font-bold">Sui</dd>
          <dt className="text-muted-foreground">Launchpad</dt><dd className="font-bold">{launch.launchpad}</dd>
          <dt className="text-muted-foreground">LP pair</dt><dd className="font-bold">${launch.pairToken}</dd>
          <dt className="text-muted-foreground">Starting LP</dt><dd className="font-bold">{launch.liquidity} ${launch.pairToken}</dd>
          <dt className="text-muted-foreground">Dev buy</dt><dd className="font-bold">{launch.devBuy > 0 ? `${launch.devBuy} $${launch.pairToken}` : "None"}</dd>
          <dt className="text-muted-foreground">Supply</dt><dd className="font-bold">{launch.totalSupply.toLocaleString()}</dd>
          <dt className="text-muted-foreground">Image</dt><dd className="font-bold">{launch.imageName ?? "Not provided"}</dd>
        </dl>
        <div className="border border-border p-3">
          <p className="font-display text-sm uppercase">Fees · {LAUNCH_FEE_SUI === 0 ? "0 launch fee" : `${LAUNCH_FEE_SUI} SUI launch fee`}</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {CREATOR_FEE_ROUTES.map((route) => (
              <li key={route.label} className="flex items-center justify-between gap-3">
                <span>{route.label}</span>
                <span className="font-bold text-foreground">{Math.round(route.share * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.65rem] text-muted-foreground">Of the creator fee the launchpad pays on trading volume. Your 70%: {LAUNCHER_SHARE_USES}.</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground">{GAS_NOTE_TERMINAL} Launch calls from {X_BOT_HANDLE} on X are gas-sponsored from the bot reserve.</p>
        </div>
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