// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { verifyInitData } from "./initData";

async function authed(initData: string) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Telegram is not configured");
  const user = await verifyInitData(initData, token);
  if (!user) throw new Error("Open this inside Telegram");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { user, db: supabaseAdmin };
}

export const tgSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    await db.from("tg_users").upsert({
      tg_user_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name ?? null,
      photo_url: user.photo_url ?? null,
      last_seen_at: new Date().toISOString(),
    });
    const { data: watch } = await db.from("tg_watchlist").select("launch_id").eq("tg_user_id", user.id);
    const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", user.id).maybeSingle();
    return {
      name: user.first_name ?? user.username ?? "friend",
      username: user.username ?? null,
      xUsername: row?.x_username ?? null,
      privyAppId: process.env["PRIVY_APP_ID"] ?? null,
      watchlist: (watch ?? []).map((w) => w.launch_id),
    };
  });

export const tgToggleWatch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), launchId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    const { data: existing } = await db.from("tg_watchlist").select("id").eq("tg_user_id", user.id).eq("launch_id", data.launchId).maybeSingle();
    if (existing) {
      await db.from("tg_watchlist").delete().eq("id", existing.id);
      return { watching: false };
    }
    await db.from("tg_watchlist").insert({ tg_user_id: user.id, launch_id: data.launchId });
    return { watching: true };
  });

/** Links the X account verified by Privy to this Telegram user. */
export const tgLinkX = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), privyToken: z.string().min(20).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    const appId = process.env["PRIVY_APP_ID"];
    const secret = process.env["PRIVY_APP_SECRET"];
    if (!appId || !secret) throw new Error("Privy is not configured");
    const { verifiedXFromPrivy } = await import("./privy.server");
    const { did, xUsername } = await verifiedXFromPrivy(data.privyToken, appId, secret);
    if (!xUsername) throw new Error("No X account on that sign-in");
    await db.from("tg_users").update({ x_username: xUsername, privy_user_id: did }).eq("tg_user_id", user.id);
    return { xUsername };
  });

export const tgUnlinkX = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    await db.from("tg_users").update({ x_username: null, privy_user_id: null }).eq("tg_user_id", user.id);
    return { ok: true };
  });

/** Read-only OurBank view for the X account this Telegram user verified via Privy. */
export const tgGetBankWallet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", user.id).maybeSingle();
    const handle = row?.x_username;
    if (!handle) return { linked: false as const };
    const { ensureBankWallet, bankBalances } = await import("@/lib/terminal/bank-wallet.server");
    const wallet = await ensureBankWallet(handle, null);
    const { rpc } = await import("@/lib/terminal/suipump-launch.server");
    const raw = await bankBalances(wallet.address).catch(() => []);
    const sui = await Promise.all(
      raw.map(async (b) => {
        const meta = await rpc<{ symbol: string; decimals: number } | null>("suix_getCoinMetadata", [b.coinType]).catch(() => null);
        return { coinType: b.coinType, symbol: meta?.symbol ?? b.coinType.split("::").at(-1)!, amount: Number(b.balance) / 10 ** (meta?.decimals ?? 9) };
      }),
    );
    const { ensureEvmDepositAddress } = await import("@/lib/terminal/bank-evm.server");
    const { ensureSolDepositAddress } = await import("@/lib/terminal/bank-sol.server");
    const [evmAddress, solAddress] = await Promise.all([
      ensureEvmDepositAddress(handle).catch(() => null),
      ensureSolDepositAddress(handle).catch(() => null),
    ]);
    const { evmBalances, solBalances } = await import("@/lib/terminal/chain-balances.server");
    const [evm, sol] = await Promise.all([
      evmAddress ? evmBalances(evmAddress).catch(() => []) : Promise.resolve([]),
      solAddress ? solBalances(solAddress).catch(() => null) : Promise.resolve(null),
    ]);
    const { aftermathPrices } = await import("./runCommand.server");
    const prices = await aftermathPrices(sui.map((b) => b.coinType));
    const suiPriced = sui.map((b) => ({ ...b, usd: prices[b.coinType] != null ? prices[b.coinType]! * b.amount : null }));
    return { linked: true as const, handle, address: wallet.address, evmAddress, solAddress, sui: suiPriced, evm, sol };
  });

/**
 * In-app trading terminal: runs the same send / buy / sell / bridge / fee logic
 * as an X mention, as the X account this Telegram user verified via Privy.
 */
export const tgRunCommand = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), text: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { user } = await authed(data.initData);
    const { runTgCommand } = await import("./runCommand.server");
    const { reply } = await runTgCommand(user.id, data.text);
    return { reply };
  });

/** Public read: live Blast.fun presales (server-proxied, partner key stays server-side). */
export const tgBlastPresales = createServerFn({ method: "GET" }).handler(async () => {
  const { getBlastPresales } = await import("@/lib/blast/blast.server");
  return getBlastPresales();
});
