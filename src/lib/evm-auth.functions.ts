// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { evmLoginMessage, recoverEvmAddress } from "./evm-auth";

const input = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  issuedAt: z.string().min(10).max(40),
});

/**
 * Sign in with an EVM wallet (MetaMask, Rabby…). Verifies an EIP-191
 * personal_sign over a fixed message, then returns one-time credentials.
 * The player gets an OurBank Sui wallet for trading Sui tokens.
 */
export const evmLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const issued = new Date(data.issuedAt);
    if (Number.isNaN(issued.getTime()) || Math.abs(Date.now() - issued.getTime()) > 10 * 60_000) {
      throw new Error("Signature expired. Please try again.");
    }
    const address = data.address.toLowerCase();
    const recovered = recoverEvmAddress(evmLoginMessage(address, data.issuedAt), data.signature);
    if (recovered !== address) throw new Error("Signature does not match this wallet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureProfileRow, findProfileBySocial, randomPassword } = await import("./social-auth.server");

    const email = `e${address.slice(2)}@evm.ourblast.xyz`;
    const password = randomPassword();
    const existing = await findProfileBySocial(supabaseAdmin, "evm", address);
    let userId = existing?.id;
    if (existing?.is_banned) throw new Error("This wallet is banned from OURBLAST.");
    if (userId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error("Could not open a session for this wallet.");
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { evm_address: address },
      });
      if (error || !created.user) throw new Error("Could not register this wallet.");
      userId = created.user.id;
    }
    const { created } = await ensureProfileRow(supabaseAdmin, userId, {
      provider: "evm",
      socialId: address,
      displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
    });
    return { email, password, isNew: created };
  });
