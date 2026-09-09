import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_SUI_CHAIN,
  DEFAULT_TREASURY_ADDRESS,
  ECONOMY,
  PRIZE_POOL_ADDRESS,
  SUI_GRAPHQL,
  feeInMist,
} from "./ourblast.config";

const input = z.object({
  digest: z.string().min(20).max(120),
  purpose: z.enum(["game", "chat"]),
});

const recoverInput = z.object({ purpose: z.enum(["game", "chat"]) });

function serverTreasury(): string {
  const configured = process.env['OURBLAST_TREASURY_ADDRESS'];
  return (configured && configured.startsWith("0x") ? configured : DEFAULT_TREASURY_ADDRESS).toLowerCase();
}

function graphqlEndpoint(): string {
  const chain = process.env['SUI_CHAIN'] ?? DEFAULT_SUI_CHAIN;
  return SUI_GRAPHQL[chain] ?? SUI_GRAPHQL[DEFAULT_SUI_CHAIN]!;
}

type ChainTx = {
  digest: string;
  sender?: { address?: string } | null;
  effects?: {
    status?: string | null;
    timestamp?: string | null;
    balanceChanges?: {
      nodes?: { owner?: { address?: string } | null; amount?: string; coinType?: { repr?: string } }[];
    } | null;
  } | null;
};

const TX_FIELDS = `
  digest
  sender { address }
  effects {
    status
    timestamp
    balanceChanges { nodes { owner { address } amount coinType { repr } } }
  }
`;

/** Queries the Sui GraphQL service; public JSON-RPC fullnodes are retired. */
async function suiQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(graphqlEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** SUI actually credited to a given address in this transaction, in MIST. */
function amountTo(tx: ChainTx, address: string): number {
  const target = address.toLowerCase();
  return (tx.effects?.balanceChanges?.nodes ?? [])
    .filter((c) => {
      const repr = c.coinType?.repr ?? "";
      return (
        c.owner?.address?.toLowerCase() === target && (repr === "" || repr.endsWith("::sui::SUI"))
      );
    })
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
}

function requiredMist(purpose: "game" | "chat"): number {
  // Game fees split on-chain across founder, prize pool, and treasury. The
  // treasury (ops) portion is what must land in the community wallet; the
  // prize pool portion must land in the prize pool wallet.
  return purpose === "game"
    ? Math.floor(feeInMist(purpose) * ECONOMY.opsShare)
    : feeInMist(purpose);
}

function requiredPrizeMist(): number {
  return Math.floor(feeInMist("game") * ECONOMY.prizePoolShare);
}

/**
 * Verifies a SUI payment on chain before anything is unlocked.
 *
 * Checks: the transaction exists, it succeeded, the sender is this player's own
 * wallet, the fee (or more) landed on the configured treasury address, and the
 * digest has never been recorded. The unique digest column makes replay or
 * double-credit impossible even under a race.
 */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("sui_payments")
      .select("id, user_id, purpose, consumed_at")
      .eq("digest", data.digest)
      .maybeSingle();
    if (existing) {
      if (existing.user_id !== userId || existing.purpose !== data.purpose || existing.consumed_at) {
        throw new Error("That payment has already been used.");
      }
      return { paymentId: existing.id as string };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address, is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found.");
    if (profile.is_banned) throw new Error("This wallet is banned from OURBLAST.");

    // A freshly executed transaction can take a few seconds to be readable, so
    // keep asking before giving up.
    let tx: ChainTx | null = null;
    for (let attempt = 0; attempt < 10 && !tx; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const result = await suiQuery<{ transaction: ChainTx | null }>(
        `query Tx($digest: String!) { transaction(digest: $digest) { ${TX_FIELDS} } }`,
        { digest: data.digest },
      );
      tx = result?.transaction ?? null;
    }
    if (!tx) throw new Error("Payment not found on the Sui network yet. Try again in a moment.");

    if (tx.effects?.status !== "SUCCESS") throw new Error("That payment did not succeed.");

    const sender = (tx.sender?.address ?? "").toLowerCase();
    if (!sender || sender !== profile.wallet_address.toLowerCase()) {
      throw new Error("That payment came from a different wallet.");
    }

    const treasury = serverTreasury();
    const opsReceived = amountTo(tx, treasury);
    const prizeReceived = amountTo(tx, PRIZE_POOL_ADDRESS);
    if (data.purpose === "game") {
      if (prizeReceived < requiredPrizeMist()) {
        throw new Error("That payment did not reach the OURBLAST prize pool.");
      }
      if (opsReceived < requiredMist("game")) {
        throw new Error("That payment did not reach the OURBLAST treasury.");
      }
    } else if (opsReceived < requiredMist(data.purpose)) {
      throw new Error("That payment did not reach the OURBLAST treasury.");
    }

    const totalReceived = opsReceived + prizeReceived;
    const { data: inserted, error } = await supabaseAdmin
      .from("sui_payments")
      .insert({
        user_id: userId,
        purpose: data.purpose,
        digest: data.digest,
        sender,
        recipient: treasury,
        amount_mist: totalReceived,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Payment already used.");

    return { paymentId: inserted.id as string };
  });

/**
 * Rescue path for wallets (mobile Slush in particular) that complete the
 * transfer on chain but never hand the digest back to the page. Looks at the
 * player's own recent transactions, finds one that paid the treasury the right
 * amount and has not been recorded yet, and turns it into a valid entry.
 */
export const recoverPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => recoverInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address, is_banned")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found.");
    if (profile.is_banned) throw new Error("This wallet is banned from OURBLAST.");

    const wallet = (profile.wallet_address as string).toLowerCase();
    const treasury = serverTreasury();
    const required = requiredMist(data.purpose);

    const result = await suiQuery<{ transactions: { nodes: ChainTx[] } }>(
      `query Recent($sender: SuiAddress!) {
         transactions(last: 15, filter: { sentAddress: $sender }) { nodes { ${TX_FIELDS} } }
       }`,
      { sender: profile.wallet_address },
    );
    const candidates = (result?.transactions?.nodes ?? []).filter(
      (tx) =>
        tx.digest &&
        tx.effects?.status === "SUCCESS" &&
        (tx.sender?.address ?? "").toLowerCase() === wallet &&
        treasuryAmount(tx, treasury) >= required,
    );
    if (candidates.length === 0) {
      throw new Error("No matching payment found on chain yet. Try again in a moment.");
    }

    const { data: known } = await supabaseAdmin
      .from("sui_payments")
      .select("digest")
      .in("digest", candidates.map((tx) => tx.digest));
    const seen = new Set((known ?? []).map((r) => r.digest as string));

    const cutoff = Date.now() - 60 * 60 * 1000;
    const fresh = candidates
      .filter((tx) => !seen.has(tx.digest))
      .filter((tx) => {
        const ms = tx.effects?.timestamp ? Date.parse(tx.effects.timestamp) : 0;
        return !ms || ms >= cutoff;
      })
      .reverse(); // newest first

    for (const tx of fresh) {
      const { data: inserted, error } = await supabaseAdmin
        .from("sui_payments")
        .insert({
          user_id: userId,
          purpose: data.purpose,
          digest: tx.digest,
          sender: wallet,
          recipient: treasury,
          amount_mist: treasuryAmount(tx, treasury),
        })
        .select("id")
        .single();
      if (error || !inserted) continue;
      return { paymentId: inserted.id as string };
    }

    throw new Error("No unused payment found on chain yet. Give it a few seconds and retry.");
  });
