// SPDX-License-Identifier: BUSL-1.1
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import { getBridgeStatus, type BridgeStatus } from "@/lib/terminal/bridge-status.functions";

type Step = { label: string; state: "wait" | "run" | "ok" | "fail"; detail?: string; link?: { href: string; text: string } };

function steps(s: BridgeStatus): Step[] {
  const { sweep, arrival, order } = s;
  if (!sweep) return [{ label: "Solana transfer", state: "run", detail: "Waiting for the bridge to start…" }];
  const solLink = sweep.txSig ? { href: `https://solscan.io/tx/${sweep.txSig}`, text: "Solscan" } : undefined;
  const solState: Step["state"] = sweep.status === "failed" ? "fail" : sweep.status === "sent" ? "ok" : "run";
  const out: Step[] = [{ label: `Send ${sweep.amount} ${sweep.token} on Solana`, state: solState, detail: sweep.status === "failed" ? sweep.error ?? "Failed." : sweep.status === "sent" ? "Confirmed" : "Confirming…", link: solLink }];

  const arrived = arrival?.status === "SUCCESS" || (order && ["swapping", "completed"].includes(order.status));
  const arrFail = arrival && ["FAILED", "REFUNDED"].includes(arrival.status);
  out.push({
    label: "SUI arrives in OurBank",
    state: solState === "fail" ? "wait" : arrFail ? "fail" : arrived ? "ok" : solState === "ok" ? "run" : "wait",
    detail: arrFail ? (arrival!.refunded ? "Bridge refunded to your Solana address." : "Bridge failed — funds are refunded to Solana.") : arrived ? (order?.receivedSui ? `${order.receivedSui} SUI received` : "Received") : solState === "ok" ? `Bridging (${arrival?.status?.toLowerCase().replace(/_/g, " ") ?? "processing"}), usually 1–5 min` : undefined,
    link: arrival?.suiTx ? { href: `https://suiscan.xyz/mainnet/tx/${arrival.suiTx}`, text: "Suiscan" } : undefined,
  });

  if (!order) {
    out.push({ label: "Auto-buy $BLAST", state: "wait", detail: sweep.status === "failed" ? undefined : "Off — SUI stays in your wallet." });
  } else {
    const st = order.status;
    out.push({
      label: "Auto-buy $BLAST",
      state: st === "completed" ? "ok" : st === "failed" || st === "expired" ? "fail" : st === "swapping" ? "run" : "wait",
      detail: st === "completed" ? (order.receivedOut ? `Bought ${Number(order.receivedOut) / 1e9 >= 1 ? (Number(order.receivedOut) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) : order.receivedOut} BLAST` : "Bought") : st === "failed" ? `Swap failed: ${order.error ?? "unknown"} — your SUI is safe in OurBank.` : st === "expired" ? "Order expired — SUI stays in OurBank; buy from the terminal." : st === "swapping" ? "Swapping…" : undefined,
      link: order.txDigest ? { href: `https://suiscan.xyz/mainnet/tx/${order.txDigest}`, text: "Suiscan" } : undefined,
    });
  }
  return out;
}

const done = (st: Step[]) => st.some((x) => x.state === "fail") || st.every((x) => x.state === "ok" || (x.state === "wait" && x.detail?.startsWith("Off")));

export function BridgeTracker({ since }: { since?: string }) {
  const fn = useServerFn(getBridgeStatus);
  const q = useQuery({
    queryKey: ["bridge-status", since ?? "latest"],
    queryFn: () => fn({ data: { since } }),
    refetchInterval: (query) => (query.state.data && done(steps(query.state.data)) ? false : 6_000),
  });
  if (!q.data) return <div className="mt-2 text-xs text-muted-foreground">Loading bridge status…</div>;
  if (!q.data.sweep && !since) return <div className="mt-2 text-xs text-muted-foreground">No SOL bridges yet.</div>;
  return (
    <ol className="mt-3 max-w-xl space-y-2 border border-border p-3 text-sm">
      {steps(q.data).map((s) => (
        <li key={s.label} className="flex gap-2">
          {s.state === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : s.state === "fail" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> : s.state === "run" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <div className="font-medium">{s.label}</div>
            {s.detail ? <div className={`break-words text-xs ${s.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>{s.detail}</div> : null}
            {s.link ? <a href={s.link.href} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View on {s.link.text}</a> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
