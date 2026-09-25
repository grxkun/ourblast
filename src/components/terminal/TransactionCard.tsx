import { CircleCheck, CircleDashed, LockKeyhole } from "lucide-react";

import type { TerminalStatus } from "@/lib/terminal/types";

const messages: Partial<Record<TerminalStatus, string>> = {
  NOT_CONNECTED: "Connect your wallet to start a transaction.",
  NOT_IMPLEMENTED: "This action is not available yet.",
  FAILED: "The transaction failed. Nothing was signed or sent.",
  CONFIRMED: "Transaction confirmed on Sui.",
};

export function TransactionCard({ status }: { status: TerminalStatus }) {
  const blocked = status === "NOT_CONNECTED" || status === "NOT_IMPLEMENTED" || status === "FAILED";
  return (
    <div className="border border-border p-4">
      <div className="flex items-center gap-2 font-display text-lg uppercase">
        {blocked ? <LockKeyhole className="size-4 text-primary" /> : status === "CONFIRMED" ? <CircleCheck className="size-4 text-lime" /> : <CircleDashed className="size-4 text-cyber" />}
        Transaction state · {status.replaceAll("_", " ")}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {messages[status] ?? "Working on it…"}
      </p>
    </div>
  );
}
