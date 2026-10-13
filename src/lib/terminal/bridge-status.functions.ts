// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BridgeStatus = {
  sweep: { id: string; token: string; amount: string; status: string; txSig: string | null; error: string | null; createdAt: string } | null;
  arrival: { status: string; suiTx: string | null; refunded: boolean } | null;
  order: { status: string; receivedSui: string | null; receivedOut: string | null; txDigest: string | null; error: string | null } | null;
};

/** Live state of the caller's latest SOL bridge: Solana tx → SUI arrival → auto $BLAST swap. */
export const getBridgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ since: z.string().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<BridgeStatus> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    let q = db.from("sol_sweeps").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(1);
    if (data.since) q = q.gte("created_at", new Date(Date.parse(data.since) - 60_000).toISOString());
    let { data: rows } = await q;
    let s = rows?.[0];
    if (s?.status === "submitted") {
      const { confirmSubmitted } = await import("./sol-sweep.server");
      await confirmSubmitted().catch(() => null);
      ({ data: rows } = await db.from("sol_sweeps").select("*").eq("id", s.id).limit(1));
      s = rows?.[0];
    }
    if (!s) return { sweep: null, arrival: null, order: null };
    const dec = s.token === "SOL" ? 1e9 : 1e6;
    const sweep = { id: s.id, token: s.token, amount: (Number(s.amount_atomic) / dec).toString(), status: s.status, txSig: s.tx_sig, error: s.error, createdAt: s.created_at };

    let arrival: BridgeStatus["arrival"] = null;
    if (s.deposit_address && s.tx_sig) {
      try {
        const r = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(s.deposit_address)}`, { signal: AbortSignal.timeout(8_000) });
        if (r.ok) {
          const j = (await r.json()) as { status?: string; swapDetails?: { destinationChainTxHashes?: { hash?: string }[] } };
          arrival = { status: j.status ?? "UNKNOWN", suiTx: j.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? null, refunded: j.status === "REFUNDED" };
        }
      } catch { /* status is best-effort */ }
    }

    let order: BridgeStatus["order"] = null;
    if (s.order_id) {
      const { data: o } = await db.from("cross_chain_orders").select("*").eq("id", s.order_id).maybeSingle();
      if (o) order = {
        status: o.status,
        receivedSui: o.received_sui != null ? (Number(o.received_sui) / 1e9).toFixed(4) : null,
        receivedOut: o.received_out != null ? String(o.received_out) : null,
        txDigest: o.tx_digest, error: o.error,
      };
    }
    return { sweep, arrival, order };
  });
