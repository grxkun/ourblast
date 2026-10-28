// SPDX-License-Identifier: BUSL-1.1
/**
 * Runs a command using a Telegram user's native or linked main wallet. Shared by the Mini App and bot chat.
 * Speed: independent steps (wallet check, module loads, fee-command checks) run in parallel; callers that already
 * know the linked handle pass it to skip a lookup.
 * Multi-wallet: buy/sell/swap run from every selected Sui wallet (each its own transaction, each reported);
 * "w2 …" targets one wallet. Everything else uses the main wallet.
 */
export async function runTgCommand(
  tgUserId: number,
  text: string,
  knownHandle?: string | null,
  opts: { slots?: number[]; mainOnly?: boolean } = {},
): Promise<{ reply: string; linked: boolean }> {
  const { isAdvisorCommand } = await import("@/lib/blast/advisor");
  if (isAdvisorCommand(text)) {
    const { launchAdvice } = await import("@/lib/blast/advisor.server");
    return { linked: true, reply: await launchAdvice(text) };
  }
  let handle = knownHandle ?? null;
  if (!handle) {
    handle = await (await import("./tgIdentity.server")).tgWalletHandle(tgUserId);
  }
  if (!handle) return { linked: false, reply: "Link your X account first (open the app → Wallet) — trades use your OurBank wallet." };

  const mw = await import("./multiWallet");
  const trimmed = text.trim();

  // Wallet management.
  const wc = mw.parseWalletCommand(trimmed);
  if (wc) {
    const w = await import("./tgWallets.server");
    if (wc.op === "error") return { linked: true, reply: wc.error };
    if (wc.op === "list") return { linked: true, reply: await w.walletsReply(tgUserId, handle) };
    if (wc.op === "new") {
      const r = await w.createTgWallet(tgUserId, wc.label);
      return { linked: true, reply: r.ok ? `🆕 Wallet w${r.wallet.slot} · ${r.wallet.label}\n${r.address}\nFund it: send 5 sui to ${r.address}\nTrade from it: use ${r.wallet.slot} (or use 1,${r.wallet.slot})` : r.error };
    }
    const r = await w.setTradeSlots(tgUserId, handle, wc.slots);
    return { linked: true, reply: r.ok ? `✅ Trades now run from: ${r.selected.map((s) => `w${s}`).join(", ")}${r.selected.length > 1 ? "\nEach buy spends the amount from every selected wallet." : ""}` : r.error! };
  }

  // Limit orders.
  const lim = await import("./limitOrder");
  const lc = lim.parseLimitCommand(trimmed);
  if (lc) {
    const ls = await import("./limitOrder.server");
    if (lc.op === "error") return { linked: true, reply: lc.error };
    if (lc.op === "list") return { linked: true, reply: await ls.listLimitOrders(tgUserId) };
    if (lc.op === "cancel") return { linked: true, reply: await ls.cancelLimitOrders(tgUserId, lc.id) };
    const { listTgWallets } = await import("./tgWallets.server");
    const { selected } = await listTgWallets(tgUserId, handle);
    if (lc.op === "review") return { linked: true, reply: `${await ls.limitReview(lc, selected.length)}\n\nTo place it, send:\n${lim.limitLine(lc)}` };
    return { linked: true, reply: await ls.placeLimitOrder(tgUserId, lc, selected) };
  }

  const prefix = mw.parseWalletPrefix(trimmed);
  const { telegramRecipientCommand } = await import("./recipient");
  const { tgRecipientAddress } = await import("./tgIdentity.server");
  let resolved;
  try {
    resolved = await telegramRecipientCommand(prefix?.rest ?? trimmed, tgRecipientAddress);
  } catch {
    return { linked: true, reply: "Couldn't check the Telegram recipient. Nothing was sent or traded. Try again later." };
  }
  if (!resolved.ok) return { linked: true, reply: resolved.reply };
  const command = resolved.text;
  if (!opts.mainOnly && (prefix || opts.slots || mw.isFanOutTrade(command) || /^snipe\s/i.test(command))) {
    const { tradeTargets } = await import("./tgWallets.server");
    const targets = await tradeTargets(tgUserId, handle, prefix ? [prefix.slot] : opts.slots);
    if (!targets.length) return { linked: true, reply: prefix ? `You don't have wallet w${prefix.slot}. See: wallets` : "No trading wallet selected. See: wallets" };
    if (targets.length > 1 || targets[0]?.slot !== 1) {
      const results = await Promise.all(targets.map(async (t) => {
        const r = await runOne(t.handle, t.slot === 1 ? handle : null, command).catch((e) => `Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
        return `— w${t.slot} · ${t.label}\n${r}`;
      }));
      return { linked: true, reply: results.join("\n\n") };
    }
  }
  return { linked: true, reply: await runOne(handle, handle, command) };
}

/** One command on one OurBank wallet. Fee/claim commands only apply to the X-linked main wallet. */
async function runOne(bankHandle: string, xHandle: string | null, text: string): Promise<string> {
  const { parseSnipeCommand, actionCommand } = await import("./chatTrade");
  const snipe = parseSnipeCommand(text);
  if (snipe) {
    if (!snipe.ok) return snipe.error;
    const { sniperPreflight } = await import("@/lib/blast/sniper.server");
    const check = await sniperPreflight(bankHandle, snipe.coinType, snipe.amount, snipe.slippage);
    if (!check.ok) return check.reply;
    text = actionCommand({ side: "buy", amount: snipe.amount, symbol: snipe.symbol, slippage: snipe.slippage }, snipe.coinType);
  }
  const [{ ensureBankWallet }, claim, bank] = await Promise.all([
    import("@/lib/terminal/bank-wallet.server"),
    import("@/lib/terminal/xClaim.server"),
    import("@/lib/terminal/bank.server"),
  ]);
  const [, link, check, claimed] = await Promise.all([
    ensureBankWallet(bankHandle, null),
    xHandle ? claim.handleClaimLinkMention(xHandle, text) : null,
    xHandle ? claim.handleFeeCheckMention(xHandle, text) : null,
    xHandle ? claim.handleFeeClaimMention(xHandle, text) : null,
  ]);
  const feeReply = link ?? check ?? claimed;
  const raw = feeReply ?? (await bank.handleBankMention(`terminal-tg-${crypto.randomUUID()}`, bankHandle, text)) ?? "";
  const esc = bankHandle.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return raw.replace(new RegExp(`^@${esc}\\s+`, "i"), "").trim() ||
    "I couldn't read that. Try: buy 1 sui of 0x…::coin::COIN · sell 50% $BLAST · send 5 sui to @friend · bridge 0.05 sol to sui · balance · wallets";
}

/** Live USD prices from Aftermath. Returns {} on any failure — never invents a price. */
export async function aftermathPrices(coinTypes: string[]): Promise<Record<string, number>> {
  if (!coinTypes.length) return {};
  try {
    const res = await fetch("https://aftermath.finance/api/price-info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coins: coinTypes }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, { price?: number }>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(json)) if (typeof v?.price === "number" && v.price > 0) out[k] = v.price;
    return out;
  } catch {
    return {};
  }
}
