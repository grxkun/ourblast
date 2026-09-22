import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_TREASURY_ADDRESS } from "@/lib/ourblast.config";

export interface CreatorFeeVaultRow {
  curveId: string;
  symbol: string;
  name: string;
  pendingSui: number;
  graduated: boolean;
  /** Basis points of this vault that pay the signed-in viewer's wallet. */
  yourBps: number;
  yourSui: number;
  /** Whether the viewer is allowed to trigger the distribution. */
  canClaim: boolean;
  payouts: { recipient: string; bps: number }[];
}

/** Wallet + roles of the signed-in viewer, used to decide who may distribute. */
async function viewerContext(supabase: {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
}, userId: string) {
  const [{ data: profile }, admin, moderator] = await Promise.all([
    supabase.from("profiles").select("wallet_address").eq("id", userId).maybeSingle(),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
  ]);
  return {
    wallet: (profile?.wallet_address ?? "").toLowerCase() || null,
    isStaff: Boolean(admin?.data) || Boolean(moderator?.data),
  };
}

/**
 * Creator-fee vaults OURBLAST can distribute, with the viewer's own share.
 * Anyone who is paid by a vault — the launcher, the treasury wallet owner, the
 * dev wallet, or staff — may trigger it; the split itself is fixed on chain.
 */
export const getCreatorFeeVaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCreatorFeeVaults } = await import("./creatorClaim.server");
    const [vaults, viewer] = await Promise.all([
      listCreatorFeeVaults(),
      viewerContext(context.supabase as never, context.userId),
    ]);
    const rows: CreatorFeeVaultRow[] = vaults.map((vault) => {
      const mine = vault.payouts
        .filter((p) => viewer.wallet && p.recipient === viewer.wallet)
        .reduce((sum, p) => sum + p.bps, 0);
      return {
        curveId: vault.curveId,
        symbol: vault.symbol,
        name: vault.name,
        pendingSui: vault.pendingSui,
        graduated: vault.graduated,
        yourBps: mine,
        yourSui: (vault.pendingSui * mine) / 10_000,
        canClaim: viewer.isStaff || mine > 0,
        payouts: vault.payouts,
      };
    });
    return {
      wallet: viewer.wallet,
      isStaff: viewer.isStaff,
      treasury: DEFAULT_TREASURY_ADDRESS,
      totalPendingSui: rows.reduce((sum, row) => sum + row.pendingSui, 0),
      yourPendingSui: rows.reduce((sum, row) => sum + row.yourSui, 0),
      vaults: rows,
    };
  });

/**
 * Distributes one token's accumulated creator fees to every payee written into
 * it at launch — one press, straight on chain, no launchpad account needed.
 */
export const claimCreatorFeeVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ curveId: z.string().min(10).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const { listCreatorFeeVaults, claimCreatorFeeVault: distribute } = await import("./creatorClaim.server");
    const [vaults, viewer] = await Promise.all([
      listCreatorFeeVaults(),
      viewerContext(context.supabase as never, context.userId),
    ]);
    const vault = vaults.find((row) => row.curveId === data.curveId);
    if (!vault) throw new Error("That token's fee vault is not managed by OURBLAST.");
    const mine = vault.payouts
      .filter((p) => viewer.wallet && p.recipient === viewer.wallet)
      .reduce((sum, p) => sum + p.bps, 0);
    if (!viewer.isStaff && mine <= 0) {
      throw new Error("This token's creator fees do not pay your connected wallet, so you cannot distribute them.");
    }
    const result = await distribute(data.curveId);
    return {
      ...result,
      symbol: vault.symbol,
      yourSui: (result.claimedSui * (mine || 0)) / 10_000,
    };
  });
