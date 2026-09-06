import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentPurpose } from "./ourblast.config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/**
 * Claims a verified, unused payment for a reward. The conditional update is
 * the single point where a payment is spent, so two concurrent submissions
 * can never both consume the same digest.
 */
export async function consumePayment(
  admin: Admin,
  paymentId: string,
  userId: string,
  purpose: PaymentPurpose,
): Promise<string> {
  const { data, error } = await admin
    .from("sui_payments")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("No verified payment for this action. Pay again to continue.");
  return data.id as string;
}

export async function currentSeasonId(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
