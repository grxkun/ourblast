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
        const meta = b.decimals == null
          ? await (await import("@/lib/terminal/sui-balances.server")).readCoinMetadata(b.coinType).catch(() => null)
          : null;
        const decimals = b.decimals ?? meta?.decimals ?? 9;
        return { coinType: b.coinType, symbol: b.symbol ?? meta?.symbol ?? b.coinType.split("::").at(-1)!, amount: Number(b.balance) / 10 ** decimals };
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

async function linkedHandle(initData: string) {
  const { user, db } = await authed(initData);
  const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", user.id).maybeSingle();
  if (!row?.x_username) throw new Error("Link your X account first.");
  return { user, handle: row.x_username };
}

/** Main OurBank NFT inventory; the caller cannot choose another account's address. */
export const tgWalletNfts = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { handle } = await linkedHandle(data.initData);
    const { ensureBankWallet } = await import("@/lib/terminal/bank-wallet.server");
    const { readSuiNfts } = await import("@/lib/terminal/sui-balances.server");
    const wallet = await ensureBankWallet(handle, null);
    try {
      return { address: wallet.address, nfts: await readSuiNfts(wallet.address), error: null };
    } catch {
      return { address: wallet.address, nfts: [], error: "Couldn't read your NFTs. Please refresh." };
    }
  });

/** Multi-wallet manager: lists the account's Sui wallets with SUI balance and which ones trade. */
export const tgListWallets = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, handle } = await linkedHandle(data.initData);
    const { listTgWallets } = await import("./tgWallets.server");
    const { ensureBankWallet, bankBalances } = await import("@/lib/terminal/bank-wallet.server");
    const { wallets, selected } = await listTgWallets(user.id, handle);
    const rows = await Promise.all(wallets.map(async (w) => {
      const bw = await ensureBankWallet(w.handle, null);
      const bal = await bankBalances(bw.address).catch(() => null);
      const s = bal?.find((b) => /^0x0*2::sui::SUI$/.test(b.coinType));
      return { slot: w.slot, label: w.label, address: bw.address, sui: bal ? Number(s?.balance ?? 0) / 1e9 : null };
    }));
    return { wallets: rows, selected };
  });

export const tgCreateWallet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), label: z.string().max(20).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { user } = await linkedHandle(data.initData);
    const { createTgWallet } = await import("./tgWallets.server");
    const label = data.label?.trim().replace(/[^\w .-]/g, "").slice(0, 20) || null;
    const r = await createTgWallet(user.id, label);
    if (!r.ok) throw new Error(r.error);
    return { slot: r.wallet.slot, address: r.address };
  });

export const tgSetTradeSlots = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), slots: z.array(z.number().int().min(1).max(6)).min(1).max(6) }).parse(d))
  .handler(async ({ data }) => {
    const { user, handle } = await linkedHandle(data.initData);
    const { setTradeSlots } = await import("./tgWallets.server");
    const r = await setTradeSlots(user.id, handle, [...new Set(data.slots)]);
    if (!r.ok) throw new Error(r.error ?? "Couldn't save.");
    return { selected: r.selected };
  });

/** Reveals one Sui wallet's private key to its Telegram owner. Enclave (Turnkey) keys can't be exported. */
export const tgExportWalletKey = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), slot: z.number().int().min(1).max(6) }).parse(d))
  .handler(async ({ data }) => {
    const { user, handle } = await linkedHandle(data.initData);
    const { listTgWallets } = await import("./tgWallets.server");
    const { wallets } = await listTgWallets(user.id, handle);
    const w = wallets.find((x) => x.slot === data.slot);
    if (!w) throw new Error(`You don't have wallet ${data.slot}.`);
    const { findBankWallet } = await import("@/lib/terminal/bank-wallet.server");
    const row = await findBankWallet(w.handle);
    if (!row) throw new Error("Wallet not found.");
    if (row.signing_backend === "turnkey" || !row.secret_ciphertext) {
      throw new Error("This wallet's key lives in a secure enclave and can't be exported.");
    }
    const { decryptConnectionKey } = await import("@/lib/connection-key.server");
    return { address: row.address, secretKey: decryptConnectionKey(row.secret_ciphertext) };
  });

const SUI_T = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const GAS_KEEP = 20_000_000n; // 0.02 SUI left behind for network fees

function toRaw(amount: string, decimals: number): bigint {
  const [w, f = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f)) throw new Error("Enter a valid amount.");
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

async function walletCtx(initData: string) {
  const { user, handle } = await linkedHandle(initData);
  const { listTgWallets } = await import("./tgWallets.server");
  const bw = await import("@/lib/terminal/bank-wallet.server");
  const { rpc } = await import("@/lib/terminal/suipump-launch.server");
  const { wallets } = await listTgWallets(user.id, handle);
  const bySlot = async (slot: number) => {
    const w = wallets.find((x) => x.slot === slot);
    if (!w) throw new Error(`You don't have wallet ${slot}.`);
    const e = await bw.ensureBankWallet(w.handle, null);
    return { ...w, address: e.address };
  };
  const tokens = async (address: string) => {
    const raw = await bw.bankBalances(address).catch(() => []);
    return Promise.all(raw.map(async (b) => {
      const meta = b.coinType === SUI_T ? { symbol: "SUI", decimals: 9 }
        : b.decimals == null
          ? await (await import("@/lib/terminal/sui-balances.server")).readCoinMetadata(b.coinType).catch(() => null)
          : null;
      const decimals = b.coinType === SUI_T ? 9 : (b.decimals ?? meta?.decimals ?? 9);
      return { coinType: b.coinType, symbol: b.symbol ?? meta?.symbol ?? b.coinType.split("::").at(-1)!, decimals, raw: b.balance, amount: Number(b.balance) / 10 ** decimals };
    }));
  };
  return { wallets, bySlot, tokens, bw };
}

/** Every token one wallet holds, for the transfer picker. */
export const tgWalletTokens = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), slot: z.number().int().min(1).max(6) }).parse(d))
  .handler(async ({ data }) => {
    const c = await walletCtx(data.initData);
    const w = await c.bySlot(data.slot);
    const t = await c.tokens(w.address);
    return { tokens: t.map(({ raw, ...r }) => ({ ...r, raw: raw.toString() })).sort((a, b) => (a.coinType === SUI_T ? -1 : b.coinType === SUI_T ? 1 : b.amount - a.amount)) };
  });

/**
 * Moves one token from a wallet to other wallets (distribute) or to an external Sui address (withdraw).
 * Each target gets `amount`; "max" (single target only) sends all, keeping 0.02 SUI for fees.
 */
export const tgWalletTransfer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    initData: z.string().min(1).max(4096),
    fromSlot: z.number().int().min(1).max(6),
    coinType: z.string().min(3).max(300),
    amount: z.string().max(40),
    toSlots: z.array(z.number().int().min(1).max(6)).max(5).default([]),
    toAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/).nullable().default(null),
  }).parse(d))
  .handler(async ({ data }) => {
    const c = await walletCtx(data.initData);
    const from = await c.bySlot(data.fromSlot);
    const targets: { label: string; address: string }[] = [];
    for (const s of new Set(data.toSlots)) {
      if (s === data.fromSlot) continue;
      const t = await c.bySlot(s);
      targets.push({ label: `w${s}`, address: t.address });
    }
    if (data.toAddress) targets.push({ label: `${data.toAddress.slice(0, 8)}…${data.toAddress.slice(-4)}`, address: data.toAddress });
    if (!targets.length) throw new Error("Pick at least one destination.");
    const tok = (await c.tokens(from.address)).find((t) => t.coinType === data.coinType);
    if (!tok) throw new Error("That wallet doesn't hold this token.");
    const suiBal = tok.coinType === SUI_T ? tok.raw : ((await c.bw.bankBalances(from.address)).find((b) => b.coinType === SUI_T)?.balance ?? 0n);
    let each: bigint | null;
    if (data.amount === "max") {
      if (targets.length > 1) throw new Error("Max works with one destination only.");
      each = tok.coinType === SUI_T ? tok.raw - GAS_KEEP : null;
      if (each !== null && each <= 0n) throw new Error("Not enough SUI after keeping 0.02 for fees.");
    } else {
      each = toRaw(data.amount, tok.decimals);
      if (each <= 0n) throw new Error("Amount must be above 0.");
      const total = each * BigInt(targets.length);
      const need = tok.coinType === SUI_T ? total + GAS_KEEP * BigInt(targets.length) : total;
      if ((tok.coinType === SUI_T ? suiBal : tok.raw) < need) throw new Error(`w${from.slot} doesn't have enough ${tok.symbol}${tok.coinType === SUI_T ? " (incl. fees)" : ""}.`);
    }
    if (suiBal < GAS_KEEP / 2n) throw new Error(`w${from.slot} needs a little SUI for network fees.`);
    const row = await c.bw.findBankWallet(from.handle);
    if (!row) throw new Error("Wallet not found.");
    const results: { to: string; ok: boolean; digest?: string; error?: string }[] = [];
    for (const t of targets) {
      const r = await c.bw.sendFromBankWallet(row, tok.coinType, each, t.address);
      results.push(r.ok ? { to: t.label, ok: true, digest: r.digest } : { to: t.label, ok: false, error: r.error });
      if (!r.ok) break; // stop on the first failure so nothing unexpected follows
    }
    return { symbol: tok.symbol, results };
  });

/** Sweeps every token (or only SUI) from all other wallets into one. Tokens first, then SUI minus a fee reserve. */
export const tgConsolidate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), toSlot: z.number().int().min(1).max(6), only: z.enum(["sui", "all"]) }).parse(d))
  .handler(async ({ data }) => {
    const c = await walletCtx(data.initData);
    const dest = await c.bySlot(data.toSlot);
    const results: { from: string; symbol: string; ok: boolean; digest?: string; error?: string }[] = [];
    for (const w of c.wallets) {
      if (w.slot === data.toSlot) continue;
      const src = await c.bySlot(w.slot);
      const toks = await c.tokens(src.address);
      const sui = toks.find((t) => t.coinType === SUI_T);
      if (!sui || sui.raw <= GAS_KEEP) { if (toks.length) results.push({ from: `w${w.slot}`, symbol: "—", ok: false, error: "Not enough SUI for fees" }); continue; }
      const row = await c.bw.findBankWallet(src.handle);
      if (!row) continue;
      if (data.only === "all") {
        for (const t of toks.filter((x) => x.coinType !== SUI_T)) {
          const r = await c.bw.sendFromBankWallet(row, t.coinType, null, dest.address);
          results.push({ from: `w${w.slot}`, symbol: t.symbol, ...(r.ok ? { ok: true, digest: r.digest } : { ok: false, error: r.error }) });
        }
      }
      const left = (await c.bw.bankBalances(src.address)).find((b) => b.coinType === SUI_T)?.balance ?? 0n;
      if (left > GAS_KEEP) {
        const r = await c.bw.sendFromBankWallet(row, SUI_T, left - GAS_KEEP, dest.address);
        results.push({ from: `w${w.slot}`, symbol: "SUI", ...(r.ok ? { ok: true, digest: r.digest } : { ok: false, error: r.error }) });
      }
    }
    return { to: `w${data.toSlot}`, results };
  });

/** Bridge in/out of Sui history with live status, read-only. */
export const tgBridgeHistory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { handle } = await linkedHandle(data.initData);
    const { bridgeHistory } = await import("./bridgeHistory.server");
    return bridgeHistory(handle, 20);
  });
