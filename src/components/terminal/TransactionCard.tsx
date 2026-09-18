import { CircleCheck, CircleDashed, CircleX, LockKeyhole } from "lucide-react";

import type { TerminalStatus } from "@/lib/terminal/types";

const steps = ["Preparing", "Awaiting wallet signature", "Submitting transaction", "Confirming on Sui", "Launchpad listing created", "Bonding curve live"];

export function TransactionCard({ status }: { status: TerminalStatus }) {
  const blocked = status === "NOT_CONNECTED" || status === "NOT_IMPLEMENTED" || status === "FAILED";
  return (
    <div className="border border-border p-4">
      <div className="mb-3 flex items-center gap-2 font-display text-lg uppercase">
        {blocked ? <LockKeyhole className="size-4 text-primary" /> : status === "CONFIRMED" ? <CircleCheck className="size-4 text-lime" /> : <CircleDashed className="size-4 text-cyber" />}
        Transaction state · {status.replaceAll("_", " ")}
      </div>
      <ol className="grid gap-2 text-xs sm:grid-cols-2">
        {steps.map((step) => <li key={step} className="flex items-center gap-2 text-muted-foreground"><CircleX className="size-3.5" /> {step}</li>)}
      </ol>
      <p className="mt-3 border-t border-border pt-3 text-xs font-bold">No transaction has been created or signed.</p>
    </div>
  );
}