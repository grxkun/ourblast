import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BOT_WALLET_ADDRESS,
  FOUNDER_ADDRESS,
  MIST_PER_SUI,
} from "@/lib/ourblast.config";
import {
  gql,
  rpc,
  gasCoins,
  loadDeployer,
  withGas,
  signAndExecute,
  referenceGasPrice,
  type ExecutedTransaction,
} from "@/lib/terminal/suipump-launch.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any): Promise<string> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin")) throw new Error("Admins only.");
  return context.userId as string;
}

async function suiBalanceMist(address: string): Promise<number> {
  try {
    const data = await gql<{
      address: { balance: { totalBalance: string } | null } | null;
    }>(
      `query($a:SuiAddress!){address(address:$a){balance(coinType:"0x2::sui::SUI"){totalBalance}}}`,
      { a: address },
    );
    return Number(data.address?.balance?.totalBalance ?? 0);
  } catch {
    return 0;
  }
}

export interface DevFeeStatus {
  devWallet: string;
  devBalanceSui: number;
  botWallet: string;
  botBalanceSui: number;
  gameSessions: number;
  launchesDeployed: number;
  estimatedGameFeesSui: number;
  /** 10% of game fees = dev share from arcade games. */
  estimatedDevGameShareSui: number;
  botReady: boolean;
  error: string | null;
}

export const getDevFeeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    const devWallet = FOUNDER_ADDRESS.toLowerCase();
    const botWallet = BOT_WALLET_ADDRESS.toLowerCase();

    const [devBal, botBal, keypair] = await Promise.all([
      suiBalanceMist(devWallet),
      suiBalanceMist(botWallet),
      loadDeployer(),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [games, launches] = await Promise.all([
      supabaseAdmin
        .from("game_sessions")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("x_launch_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "deployed"),
    ]);

    const gameSessions = games.count ?? 0;
    const launchesDeployed = launches.count ?? 0;
    const estimatedGameFeesSui = gameSessions * 1; // 1 SUI per game
    const estimatedDevGameShareSui = Math.round(estimatedGameFeesSui * 0.1 * 100) / 100;

    return {
      devWallet,
      devBalanceSui: devBal / MIST_PER_SUI,
      botWallet,
      botBalanceSui: botBal / MIST_PER_SUI,
      gameSessions,
      launchesDeployed,
      estimatedGameFeesSui,
      estimatedDevGameShareSui,
      botReady: Boolean(keypair),
      error: keypair ? null : "Bot wallet key is not configured — cannot transfer.",
    } satisfies DevFeeStatus;
  });

const claimSchema = z.object({
  amountSui: z.number().min(0.001).max(100_000),
});

export const claimDevFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await assertAdmin(context);
    const keypair = await loadDeployer();
    if (!keypair) throw new Error("Bot wallet key is not configured.");

    const sender = keypair.getPublicKey().toSuiAddress();
    const recipient = FOUNDER_ADDRESS.toLowerCase();
    const amountMist = BigInt(Math.round(data.amountSui * MIST_PER_SUI));

    const coins = await gasCoins(sender);
    if (coins.length === 0) {
      throw new Error("The bot wallet has no spendable SUI coins. Send SUI via a normal transfer first.");
    }

    const gasPrice = await referenceGasPrice();
    const tx = new Transaction();
    withGas(tx, sender, coins, gasPrice, 100_000_000);

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
    tx.transferObjects([coin], tx.pure.address(recipient));

    const result: ExecutedTransaction = await signAndExecute(tx, keypair as Ed25519Keypair);
    if (!result.ok || !result.digest) {
      throw new Error(result.error ?? "The transfer failed on chain.");
    }

    // Log it in the audit trail.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("moderation_actions").insert({
      actor_id: actor,
      action: `dev_fee_claim:${data.amountSui}SUI`,
      target_ref: result.digest,
      reason: `Transferred ${data.amountSui} SUI from bot wallet to dev wallet ${recipient}`,
    });

    return {
      digest: result.digest,
      amountSui: data.amountSui,
      recipient,
    };
  });

export interface DevShareRow {
  symbol: string;
  launchpad: string;
  tokenAddress: string | null;
  digest: string;
  /** Dev share of the pad's creator fee, in basis points, as written on chain. */
  devBps: number | null;
  recipients: string[];
  note: string | null;
}

/**
 * Reads, straight from chain, who each launched token actually pays its creator
 * fee to. This is the honest answer to "what is my share" — the recipients are
 * baked into the launch transaction and cannot be changed afterwards.
 */
export const getDevShareLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const dev = FOUNDER_ADDRESS.toLowerCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("x_launch_requests")
      .select("symbol, launchpad, token_address, tx_digest, created_at")
      .eq("status", "DEPLOYED")
      .not("tx_digest", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    const rows = (data ?? []) as {
      symbol: string;
      launchpad: string;
      token_address: string | null;
      tx_digest: string;
    }[];

    const out: DevShareRow[] = [];
    for (const row of rows) {
      let devBps: number | null = null;
      let recipients: string[] = [];
      let note: string | null = null;
      try {
        const tx = await rpc<{
          transaction?: {
            data?: { transaction?: { inputs?: { valueType?: string; value?: unknown }[] } };
          };
        }>("sui_getTransactionBlock", [row.tx_digest, { showInput: true }]);
        const inputs = tx.transaction?.data?.transaction?.inputs ?? [];
        const addrs = inputs.find((i) => i.valueType === "vector<address>")?.value as
          | string[]
          | undefined;
        const bps = inputs.find((i) => i.valueType === "vector<u64>")?.value as
          | string[]
          | undefined;
        if (addrs && bps) {
          recipients = addrs.map((a) => a.toLowerCase());
          const index = recipients.indexOf(dev);
          devBps = index >= 0 ? Number(bps[index] ?? 0) : 0;
          if (devBps === 0) note = "Launched before the dev share existed — pays the treasury wallet only.";
        } else {
          note = "This pad handles creator fees in its own pool.";
        }
      } catch {
        note = "Could not read this launch transaction right now.";
      }
      out.push({
        symbol: row.symbol,
        launchpad: row.launchpad,
        tokenAddress: row.token_address,
        digest: row.tx_digest,
        devBps,
        recipients,
        note,
      });
    }
    return out;
  });
