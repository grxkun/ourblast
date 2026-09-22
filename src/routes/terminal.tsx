import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Terminal } from "@/components/terminal/Terminal";
import { TerminalTutorial } from "@/components/terminal/TerminalTutorial";
import { XMentionInbox } from "@/components/terminal/XMentionInbox";
import { GasReserveCard } from "@/components/terminal/GasReserveCard";
import { FeeRoutingCard } from "@/components/terminal/FeeRoutingCard";
import { CreatorClaimCard } from "@/components/terminal/CreatorClaimCard";
import { CreatorFeeDesignationCard } from "@/components/terminal/CreatorFeeDesignationCard";
import { XConnectButton } from "@/components/terminal/XConnectButton";
import { SocialSignIn } from "@/components/terminal/SocialSignIn";
import { XLaunchQueue } from "@/components/terminal/XLaunchQueue";
import { WalletButton } from "@/components/blast/WalletButton";
import { resolveLaunchpad } from "@/lib/terminal/launchpad";
import { getLauncherSettings } from "@/lib/terminal/xLauncher.functions";

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
  const fetchSettings = useServerFn(getLauncherSettings);
  const settings = useQuery({
    queryKey: ["launcher-settings"],
    queryFn: () => fetchSettings({}),
    staleTime: 60_000,
  });
  // "Ready" = the default launchpad has a verified on-chain integration.
  const defaultPad = resolveLaunchpad(settings.data?.defaultLaunchpad ?? "suipump");
  const ready = Boolean(defaultPad.integrated);

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
        <XLaunchQueue />
        <SocialSignIn />
        {ready ? (
          <TerminalTutorial onTry={(command) => setTryCommand({ command, nonce: Date.now() })} />
        ) : null}
      </div>
      {ready ? (
        <Terminal tryCommand={tryCommand} />
      ) : (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          The conversational terminal opens once a launchpad integration goes live. Until then, X launch calls appear above.
        </p>
      )}
      {ready ? (
        <div className="mt-6 space-y-6">
          <CreatorClaimCard />
          <FeeRoutingCard />
          <CreatorFeeDesignationCard />
          <GasReserveCard />
        </div>
      ) : null}
      {ready ? (
        <div className="mt-6">
          <XMentionInbox />
        </div>
      ) : null}
    </div>
  );
}
