// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TxStep = { label: string; state: "wait" | "run" | "ok" | "fail"; detail?: string; href?: string; linkText?: string };
export type TxStatus = { found: boolean; final: boolean; steps: TxStep[] };

const TARGET: Record<string, string> = { BNB: "BNB on BNB Chain", ETH_BASE: "ETH on Base", ETH_ARB: "ETH on Arbitrum", ETH_RH: "ETH on Robinhood Chain" };

/** Live progress of the caller's newest outbound SUI bridge, funded launch or EVM sweep — read straight from stored chain state. */
export const getTxStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["suiout", "launch", "evm"]), since: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<TxStatus> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.parse(data.since) - 60_000).toISOString();
    const none: TxStatus = { found: false, final: false, steps: [{ label: "Waiting for the transaction to start…", state: "run" }] };

    if (data.kind === "suiout") {
      const { data: r } = await db.from("sui_out_hops").select("*").eq("user_id", context.userId).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!r) return none;
      const failed = r.status === "failed";
      const leg1 = r.sui_digest ? "ok" : failed ? "fail" : "run";
      const leg2: TxStep["state"] = r.status === "done" ? "ok" : failed && r.sui_digest ? "fail" : r.status === "hopping" ? "run" : r.sui_digest ? "run" : "wait";
      return {
        found: true, final: r.status === "done" || failed,
        steps: [
          { label: `Send ${r.amount_sui} SUI → SOL`, state: leg1, detail: leg1 === "ok" ? "Confirmed on Sui" : failed ? r.error ?? "Failed" : "Submitting…", ...(r.sui_digest ? { href: `https://suiscan.xyz/mainnet/tx/${r.sui_digest}`, linkText: "Suiscan" } : {}) },
          { label: "SOL arrives in OurBank Solana", state: r.status === "hopping" || r.status === "done" ? "ok" : leg2 === "fail" ? "fail" : r.sui_digest ? "run" : "wait", detail: r.status === "sent" ? "Bridging, usually under 1 min" : undefined },
          { label: `Swap SOL → ${TARGET[r.target] ?? r.target}`, state: leg2, detail: r.status === "done" ? `Delivered${r.out_formatted ? ` ${r.out_formatted}` : ""} to ${r.evm_recipient.slice(0, 6)}…${r.evm_recipient.slice(-4)}` : leg2 === "fail" ? r.error ?? "Failed — SOL stays in OurBank." : leg2 === "run" && r.status === "hopping" ? "Sending…" : undefined, ...(r.leg2_tx ? { href: `https://solscan.io/tx/${r.leg2_tx}`, linkText: "Solscan" } : {}) },
        ].map((s) => (s.detail === undefined ? { ...s, detail: undefined } : s)) as TxStep[],
      };
    }

    if (data.kind === "launch") {
      const { data: r } = await db.from("funded_launches").select("*").eq("user_id", context.userId).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!r) return none;
      const st = r.status;
      const failed = st === "failed" || st === "cancelled";
      const bridged = Boolean(r.bridged_at) || st === "launching" || st === "launched";
      const { data: lr } = await db.from("x_launch_requests").select("*").eq("id", r.launch_request_id).maybeSingle();
      const lrow = lr as Record<string, unknown> | null;
      const digest = (lrow?.["tx_digest"] ?? lrow?.["digest"] ?? null) as string | null;
      const isSolTx = r.bridge_tx && !r.bridge_tx.startsWith("0x");
      return {
        found: true, final: st === "launched" || failed,
        steps: [
          { label: `Bridge ${r.amount} ${r.asset} → SUI`, state: r.bridge_tx ? "ok" : failed && !bridged ? "fail" : "run", detail: r.bridge_tx ? "Sent" : failed ? r.notice ?? "Failed — nothing moved." : "Sending…", ...(r.bridge_tx ? { href: isSolTx ? `https://solscan.io/tx/${r.bridge_tx}` : r.asset === "BNB" ? `https://bscscan.com/tx/${r.bridge_tx}` : `https://blockscan.com/tx/${r.bridge_tx}`, linkText: "explorer" } : {}) },
          { label: "SUI arrives in OurBank", state: bridged ? "ok" : failed ? "fail" : r.bridge_tx ? "run" : "wait", detail: !bridged && r.bridge_tx && !failed ? "Bridging, usually 1–5 min" : undefined },
          { label: `Launch $${r.symbol} on ${r.launchpad}`, state: st === "launched" ? "ok" : failed && bridged ? "fail" : st === "launching" ? "run" : "wait", detail: st === "launched" ? r.notice ?? "Launched ✅" : failed && bridged ? `${r.notice ?? "Launch failed"} — SUI stays in OurBank.` : st === "launching" ? "Creating token on-chain…" : undefined, ...(st === "launched" && digest ? { href: `https://suiscan.xyz/mainnet/tx/${digest}`, linkText: "Suiscan" } : {}) },
        ] as TxStep[],
      };
    }

    const { data: rows } = await db.from("evm_sweeps").select("*").eq("user_id", context.userId).gte("created_at", since).order("created_at", { ascending: false }).limit(5);
    if (!rows?.length) return none;
    const steps: TxStep[] = rows.map((r) => {
      const ok = ["sent", "hopped", "done", "completed"].includes(r.status);
      const fail = r.status === "failed";
      return { label: `${r.chain} ${r.token} → SUI`, state: ok ? "ok" : fail ? "fail" : "run", detail: fail ? r.error ?? "Failed" : ok ? "Sent — SUI arrives in 1–5 min" : r.status, ...(r.tx_hash ? { href: r.chain.toLowerCase().includes("bsc") || r.chain.toLowerCase().includes("bnb") ? `https://bscscan.com/tx/${r.tx_hash}` : `https://blockscan.com/tx/${r.tx_hash}`, linkText: "explorer" } : {}) };
    });
    return { found: true, final: steps.every((s) => s.state === "ok" || s.state === "fail"), steps };
  });
