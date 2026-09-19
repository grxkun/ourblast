import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Terminal } from "@/components/terminal/Terminal";
import { TerminalTutorial } from "@/components/terminal/TerminalTutorial";
import { XMentionInbox } from "@/components/terminal/XMentionInbox";
import { GasReserveCard } from "@/components/terminal/GasReserveCard";
import { XConnectButton } from "@/components/terminal/XConnectButton";
import { SocialSignIn } from "@/components/terminal/SocialSignIn";
import { WalletButton } from "@/components/blast/WalletButton";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Conversational Terminal | OURBLAST" },
      {
        name: "description",
        content: "A conversational Sui terminal for token launches, wallet actions, Blast.fun tools, and on-chain discovery.",
      },
      { property: "og:title", content: "OURBLAST Terminal — Sui Agent Interface" },
      { property: "og:description", content: "Parse natural-language Sui and Blast.fun actions through a secure conversational terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  const [tryCommand, setTryCommand] = useState<{ command: string; nonce: number } | undefined>();

  return (
    <div className="terminal-page">
      <div className="terminal-page-header">
        <div>
          <p className="font-body text-xs font-bold uppercase text-primary">Sui agent interface</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">Terminal</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="size-4" /> Allowlisted actions</span>
          <XConnectButton />
          <WalletButton />
        </div>
      </div>
      <div className="mb-4 space-y-4">
        <SocialSignIn />
        <TerminalTutorial onTry={(command) => setTryCommand({ command, nonce: Date.now() })} />
      </div>
      <Terminal tryCommand={tryCommand} />
      <div className="mt-6">
        <GasReserveCard />
      </div>
      <div className="mt-6">
        <XMentionInbox />
      </div>
    </div>
  );
}
