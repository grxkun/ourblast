import { ImageIcon, Link2, Pencil, Rocket, WandSparkles } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createFeeClaimLink } from "@/lib/terminal/feePayout.functions";
import { Input } from "@/components/ui/input";
import { CREATOR_FEE_ROUTES, GAS_NOTE_TERMINAL, LAUNCHER_SHARE_USES, LAUNCH_FEE_SUI } from "@/lib/terminal/fees";
import { X_BOT_HANDLE } from "@/lib/terminal/x-bot";
import { LAUNCHPADS, resolveLaunchpad } from "@/lib/terminal/launchpad";
import { normalizeLaunchConfig } from "@/lib/terminal/launchSettings";
import { describeFeePayout, normalizeXUsername, shortFeePayout, type FeePayoutMode } from "@/lib/terminal/feePayout";
import { describePerpsPosition } from "@/lib/terminal/perpsplexity";
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

  const makeClaimLink = useServerFn(createFeeClaimLink);
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);

  const generateClaimLink = async () => {
    if (!launch.feePayout.xUsername) return;
    setCreatingLink(true);
    try {
      const result = await makeClaimLink({
        data: { symbol: launch.symbol, xUsername: launch.feePayout.xUsername, amountSui: 0 },
      });
      const url = `${window.location.origin}${result.path}`;
      setClaimLink(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(`Claim link for @${result.xUsername} copied.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the claim link.");
    } finally {
      setCreatingLink(false);
    }
  };

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
        {launch.perps ? (
          <div className="space-y-2 rounded border border-primary/40 bg-primary/5 p-3">
            <p className="font-display text-lg">{describePerpsPosition({ underlying: launch.perps.underlying ?? "?", long: launch.perps.long, leverageBps: launch.perps.leverageBps, startingCapUsd: launch.perps.startingCapUsd })}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="text-xs font-bold uppercase text-muted-foreground">Underlying<Input value={launch.perps.underlying ?? ""} maxLength={12} onChange={(event) => apply({ ...launch, perps: { ...launch.perps!, underlying: event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase() || null } })} className="mt-1" /></label>
              <label className="text-xs font-bold uppercase text-muted-foreground">Direction
                <select value={launch.perps.long ? "long" : "short"} onChange={(event) => apply({ ...launch, perps: { ...launch.perps!, long: event.target.value !== "short" } })} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="long">LONG</option>
                  <option value="short">SHORT</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase text-muted-foreground">Leverage (x)<Input inputMode="numeric" value={String(launch.perps.leverageBps / 10_000)} onChange={(event) => { const x = Math.max(1, Math.min(20, Number(event.target.value.replace(/[^0-9]/g, "")) || 1)); draft({ ...launch, perps: { ...launch.perps!, leverageBps: x * 10_000 } }); }} onBlur={settle} className="mt-1" /></label>
              <label className="text-xs font-bold uppercase text-muted-foreground">Initial MC ($)<Input inputMode="decimal" value={launch.perps.startingCapUsd ? String(launch.perps.startingCapUsd) : ""} onChange={(event) => draft({ ...launch, perps: { ...launch.perps!, startingCapUsd: Number(event.target.value.replace(/[^0-9.]/g, "")) || null } })} onBlur={settle} className="mt-1" /></label>
            </div>
          </div>
        ) : null}
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
          <dt className="text-muted-foreground">Fee payout</dt><dd className="font-bold">{shortFeePayout(launch.feePayout)}</dd>
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
          <p className="mt-1 text-[0.65rem] text-muted-foreground">{GAS_NOTE_TERMINAL} Same for launch calls from {X_BOT_HANDLE} on X.</p>
          <div className="mt-3 border-t border-border pt-3">
            <p className="font-display text-sm uppercase">Who claims your 70%</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                { mode: "creator" as FeePayoutMode, label: "Me (default)" },
                { mode: "wallet" as FeePayoutMode, label: "Another wallet" },
                { mode: "x" as FeePayoutMode, label: "An X account" },
              ]).map((option) => (
                <Button
                  key={option.mode}
                  type="button"
                  size="sm"
                  variant={launch.feePayout.mode === option.mode ? "default" : "outline"}
                  onClick={() => draft({ ...launch, feePayout: { ...launch.feePayout, mode: option.mode } })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {launch.feePayout.mode === "wallet" ? (
              <Input
                value={launch.feePayout.wallet ?? ""}
                placeholder="0x… destination Sui wallet"
                onChange={(event) => draft({ ...launch, feePayout: { ...launch.feePayout, wallet: event.target.value.trim() } })}
                onBlur={settle}
                className="mt-2"
              />
            ) : null}
            {launch.feePayout.mode === "x" ? (
              <>
                <Input
                  value={launch.feePayout.xUsername ? `@${launch.feePayout.xUsername}` : ""}
                  placeholder="@handle"
                  onChange={(event) => draft({ ...launch, feePayout: { ...launch.feePayout, xUsername: normalizeXUsername(event.target.value) } })}
                  onBlur={settle}
                  className="mt-2"
                />
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  OURBLAST generates a claim link for that account; they connect Slush on the link to pull the fees.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={!launch.feePayout.xUsername || creatingLink}
                  onClick={() => void generateClaimLink()}
                >
                  <Link2 /> {creatingLink ? "Creating…" : "Create claim link"}
                </Button>
                {claimLink ? <p className="mt-1 break-all text-[0.65rem] text-muted-foreground">{claimLink}</p> : null}
              </>
            ) : null}
            <p className="mt-2 text-[0.65rem] text-muted-foreground">{describeFeePayout(launch.feePayout)}</p>
          </div>
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