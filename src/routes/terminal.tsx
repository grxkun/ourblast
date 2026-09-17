import { createFileRoute } from "@tanstack/react-router";
import { AtSign, Lock, ShieldCheck } from "lucide-react";

import { Terminal } from "@/components/terminal/Terminal";
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
      <Terminal />
    </div>
  );
}
