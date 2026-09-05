import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { loginMessage, POINTS } from "./blast";

const loginInput = z.object({
  address: z.string().min(20).max(120),
  bytes: z.string().min(10).max(4000),
  signature: z.string().min(10).max(4000),
  issuedAt: z.string().min(10).max(40),
});

function walletEmail(address: string) {
  return `w${address.replace(/^0x/, "").slice(0, 32).toLowerCase()}@wallet.ourblast.xyz`;
}

function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a Sui personal-message signature, then hands back one-time
 * credentials the browser uses to open a session. The wallet is the identity;
 * no seed phrase or private key ever leaves the wallet.
 */
export const walletLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginInput.parse(data))
  .handler(async ({ data }) => {
    const { fromBase64 } = await import("@mysten/sui/utils");
    const { verifyPersonalMessageSignature } = await import("@mysten/sui/verify");

    const issued = new Date(data.issuedAt);
    if (Number.isNaN(issued.getTime()) || Math.abs(Date.now() - issued.getTime()) > 10 * 60_000) {
      throw new Error("Signature expired. Please try connecting again.");
    }

    const messageBytes = fromBase64(data.bytes);
    const decoded = new TextDecoder().decode(messageBytes);
    if (decoded !== loginMessage(data.address, data.issuedAt)) {
      throw new Error("Unexpected sign-in message.");
    }

    const publicKey = await verifyPersonalMessageSignature(messageBytes, data.signature, {
      address: data.address,
    });
    if (publicKey.toSuiAddress() !== data.address) {
      throw new Error("Signature does not match this wallet.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { awardPoints, grantAchievement, today } = await import("./points.server");

    const email = walletEmail(data.address);
    const password = randomPassword();

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, is_banned, streak, last_login_day")
      .eq("wallet_address", data.address)
      .maybeSingle();

    let userId = existing?.id as string | undefined;
    let isNew = false;

    if (userId) {
      if (existing?.is_banned) throw new Error("This wallet is banned from OURBLAST.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error("Could not open a session for this wallet.");
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { wallet_address: data.address },
      });
      if (error || !created.user) throw new Error("Could not register this wallet.");
      userId = created.user.id;
      isNew = true;

      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        wallet_address: data.address,
        avatar_seed: data.address,
      });
      if (profileError) throw new Error("Could not create your player profile.");
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "player" });
    }

    // Daily login reward + streak, both duplicate-proof.
    const day = today();
    let earned = 0;
    if (existing?.last_login_day !== day) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const streak =
        existing?.last_login_day === yesterday ? (existing?.streak ?? 0) + 1 : 1;
      await supabaseAdmin
        .from("profiles")
        .update({ last_login_day: day, streak })
        .eq("id", userId);
      earned += await awardPoints(
        supabaseAdmin,
        userId!,
        POINTS.dailyLogin,
        "daily_login",
        `login:${day}`,
      );
      if (streak >= 7) await grantAchievement(supabaseAdmin, userId!, "daily_grinder");
    }
    if (isNew) await grantAchievement(supabaseAdmin, userId!, "early_blast");

    return { email, password, pointsEarned: earned, isNew };
  });
