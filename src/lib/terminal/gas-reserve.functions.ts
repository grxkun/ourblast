// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchSuiBalance } from "@/lib/sui-balance";
import { GAS_RESERVE_LOW_SUI, GAS_RESERVE_TOPUP_SUI, type GasReserveStatus } from "./gas-reserve";

type ReserveRow = { address: string; contributed_sui: number };

async function loadReserve(): Promise<ReserveRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("gas_reserve")
    .select("address, contributed_sui")
    .maybeSingle();
  return (data as ReserveRow | null) ?? null;
}

async function statusFor(row: ReserveRow | null): Promise<GasReserveStatus> {
  if (!row) return { created: false, address: null, balanceSui: 0, contributedSui: 0, low: true };
  let balanceSui = 0;
  try {
    balanceSui = await fetchSuiBalance(row.address);
  } catch {
    balanceSui = 0;
  }
  return {
    created: true,
    address: row.address,
    balanceSui,
    contributedSui: Number(row.contributed_sui ?? 0),
    low: balanceSui < GAS_RESERVE_LOW_SUI,
  };
}

/** Public: the reserve's address and balance are meant to be verifiable by anyone. */
export const getGasReserveStatus = createServerFn({ method: "GET" }).handler(async () => statusFor(await loadReserve()));

/**
 * Creates the reserve account once. Staff-triggered, but the key material is
 * generated inside this handler and stored encrypted — the caller only ever
 * receives the public address.
 */
export const createGasReserve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }: { context: any }) => {
    const existing = await loadReserve();
    if (existing) return statusFor(existing);

    const { data: staff } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((staff ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.includes("admin")) throw new Error("Admins only.");

    const { createReserveAccount } = await import("./gas-reserve.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = createReserveAccount();
    const { error } = await supabaseAdmin
      .from("gas_reserve")
      .insert({ id: true, address: account.address, secret_ciphertext: account.secretCiphertext });
    if (error && !error.message.includes("duplicate")) throw new Error("Could not create the gas reserve.");
    return statusFor(await loadReserve());
  });

/**
 * Replaces the reserve with the operator-supplied @ourblastbot wallet. Admin
 * only; the key never leaves the backend and the caller only sees the address.
 */
export const adoptBotGasReserve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }: { context: any }) => {
    const { data: staff } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((staff ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.includes("admin")) throw new Error("Admins only.");

    const { importReserveAccountFromSecret } = await import("./gas-reserve.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = importReserveAccountFromSecret();
    const { error } = await supabaseAdmin.from("gas_reserve").upsert(
      { id: true, address: account.address, secret_ciphertext: account.secretCiphertext },
      { onConflict: "id" },
    );
    if (error) throw new Error("Could not set the @ourblastbot gas wallet.");
    return statusFor(await loadReserve());
  });

/**
 * Records a top-up that has been skimmed from a creator fee claim. The transfer
 * itself happens on-chain; this keeps the running total the UI shows honest.
 */
export const recordGasReserveTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amountSui?: number; source?: string; reference?: string | null }) =>
    z
      .object({
        amountSui: z.number().positive().max(100).default(GAS_RESERVE_TOPUP_SUI),
        source: z.string().min(1).max(64).default("creator-fee-claim"),
        reference: z.string().max(120).nullable().default(null),
      })
      .parse(input),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data, context }: { data: { amountSui: number; source: string; reference: string | null }; context: any }) => {
    const { data: staff } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((staff ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.includes("admin")) throw new Error("Admins only.");

    const existing = await loadReserve();
    if (!existing) throw new Error("The gas reserve has not been created yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("gas_reserve_contributions")
      .insert({ amount_sui: data.amountSui, source: data.source, reference: data.reference });
    await supabaseAdmin
      .from("gas_reserve")
      .update({ contributed_sui: Number(existing.contributed_sui ?? 0) + data.amountSui })
      .eq("id", true);
    return statusFor(await loadReserve());
  });
