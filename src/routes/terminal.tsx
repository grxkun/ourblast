import { createFileRoute } from "@tanstack/react-router";
import { AtSign, Lock, ShieldCheck } from "lucide-react";

import { Terminal } from "@/components/terminal/Terminal";
import { XMentionInbox } from "@/components/terminal/XMentionInbox";
import { WalletButton } from "@/components/blast/WalletButton";
import { useBlast } from "@/components/blast/session";
import { isTerminalAllowed } from "@/lib/terminal/allowlist";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Conversational Terminal | OURBLAST" },
      {
        name: "description",
        content: "A conversational Sui terminal for token launches, wallet actions, Blast.fun tools, and on-chain discovery.",
      },
      { property: "og:title", content: "OURBLAST Terminal — Sui Agent Interface" },
      { property: "og:description", content: "Parse natural-language Sui and Blast.fun actions through a secure allowlisted terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  const { profile, ready, connecting, connect } = useBlast();
  const allowed = isTerminalAllowed(profile?.wallet_address);

  return (
    <div className="terminal-page">
      <div className="terminal-page-header">
        <div>
          <p className="font-body text-xs font-bold uppercase text-primary">Sui agent interface</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">Terminal</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="size-4" /> Allowlisted actions</span>
          <Button type="button" variant="outline" onClick={() => toast("X connection is coming soon / not connected.")}><AtSign /> Connect X</Button>
          <WalletButton />
        </div>
      </div>
      {allowed ? (
        <>
          <Terminal />
          <div className="mt-6">
            <XMentionInbox />
          </div>
        </>
      ) : (
        <TerminalLocked connected={Boolean(profile)} ready={ready} connecting={connecting} onConnect={() => void connect()} />
      )}
    </div>
  );
}

function TerminalLocked({ connected, ready, connecting, onConnect }: { connected: boolean; ready: boolean; connecting: boolean; onConnect: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-xl border-2 border-border bg-card p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Lock className="size-6" /></span>
      <h2 className="mt-4 font-display text-2xl">Private testing</h2>
      {connected ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This wallet is not on the tester list yet. The terminal is open to a small group of testers while we wire up
          real Blast.fun launches.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your Sui wallet to check access. Only testers can open the terminal right now.
          </p>
          <Button type="button" className="mt-5" onClick={onConnect} disabled={connecting || !ready}>
            {connecting ? "Connecting…" : "Connect Sui Wallet"}
          </Button>
        </>
      )}
    </div>
  );
}
