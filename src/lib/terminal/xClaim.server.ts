// SPDX-License-Identifier: BUSL-1.1
/**
 * "@ourblastbot claim fees $TICKER" — lets the X account that launched a token
 * (or the account its fees were redirected to) release the accumulated creator
 * fees straight from X. The claim always pays the payees fixed on chain at
 * launch, so a tweet can trigger a payout but can never redirect one.
 */

const CLAIM_PATTERN = /\bcla[io]?m\w*\b[^$]*?\bfees?\b|\bcla[io]?m\w*\b\s+\$[a-z0-9]+/i;
/** "claim my fees and send it to X" is still a claim — the payout destination is fixed on chain. */
const CLAIM_FEES_PATTERN = /\bcla[io]?m\w*\b[^$]*?\bfees?\b/i;

export function readFeeClaimRequest(text: string): { symbol: string | null; redirectAsked: boolean } | null {
  if (!CLAIM_PATTERN.test(text)) return null;
  const claimsFees = CLAIM_FEES_PATTERN.test(text);
  if (/\b(deploy|launch|buy|sell)\b/i.test(text)) return null;
  const transfer = /\b(send|transfer|withdraw)\b/i.test(text);
  if (transfer && !claimsFees) return null;
  const tag = text.match(/\$([a-z][a-z0-9]{0,15})\b/i);
  return { symbol: tag?.[1] ? tag[1].toUpperCase() : null, redirectAsked: transfer };
}


/** Read-only: "check fees", "my fees", "fee $X", "how much fees". Never claims. */
export function readFeeCheckRequest(text: string): { symbol: string | null } | null {
  const bare = text.replace(/@[a-z0-9_]{1,15}/gi, " ").replace(/\s+/g, " ").trim();
  if (/\bcla[io]?m/i.test(bare)) return null;
  if (/\b(deploy|launch|send|buy|sell|swap)\b/i.test(bare)) return null;
  const ask =
    /\b(?:check|show|view|see|how\s+much|what(?:'s|\s+is|\s+are)?|balance|pending)\b[^.]*\bfees?\b/i.test(bare) ||
    /^(?:my\s+)?(?:creator\s+)?fees?(?:\s+\$[a-z0-9]+)?\s*[?!.]*$/i.test(bare) ||
    /^\$[a-z0-9]+\s+fees?\s*[?!.]*$/i.test(bare);
  if (!ask) return null;
  const tag = bare.match(/\$([a-z][a-z0-9]{0,15})\b/i);
  return { symbol: tag?.[1] ? tag[1].toUpperCase() : null };
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase());

export async function handleFeeClaimMention(username: string, text: string): Promise<string | null> {
  const request = readFeeClaimRequest(text);
  if (!request) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: launches } = await supabaseAdmin
    .from("x_launch_requests")
    .select("symbol, token_address, launchpad, x_username, fee_receiver_x_username, fee_receiver_wallet, pool_object_id, tx_digest, maelstrom_launch_id, fees_paid_coin, fees_paid_quote, status")
    .eq("status", "DEPLOYED")
    .order("created_at", { ascending: false })
    .limit(500);

  const mine = (launches ?? []).filter(
    (row) => same(row.x_username, username) || same(row.fee_receiver_x_username, username),
  );
  if (mine.length === 0) {
    return `@${username} I can only release creator fees for tokens launched from your X account (or redirected to it). No launches found for you yet.`;
  }

  const targets = request.symbol ? mine.filter((row) => row.symbol.toUpperCase() === request.symbol) : mine;
  if (targets.length === 0) {
    return `@${username} $${request.symbol} wasn't launched from your account, so I can't claim its fees for you.`;
  }

  const { listCreatorFeeVaults, claimCreatorFeeVault } = await import("./creatorClaim.server");
  const vaults = await listCreatorFeeVaults().catch(() => []);

  const results: string[] = [];
  for (const row of targets.slice(0, 5)) {
    const vault = vaults.find(
      (v) =>
        (row.token_address && v.curveId.toLowerCase() === row.token_address.toLowerCase()) ||
        v.symbol === row.symbol.toUpperCase(),
    );
    if (!vault && row.launchpad === "maelstrom") {
      // STROM: Maelstrom pushes creator fees to the bot; the bot pays 80/10/10.
      const { claimMaelstromRow } = await import("./maelstrom-claim.server");
      results.push(await claimMaelstromRow(row));
      continue;
    }
    if (!vault && row.launchpad === "popular" && row.pool_object_id) {
      // POPULAR: the bot holds the creator role and pays the 80/10/10 split.
      const { feeRouting } = await import("./xLauncher.server");
      const { claimPopularCreatorFees } = await import("./popular-claim.server");
      const routing = await feeRouting(row.x_username, { handle: row.fee_receiver_x_username, wallet: row.fee_receiver_wallet });
      const outcome = await claimPopularCreatorFees(row.pool_object_id, routing.payees, routing.shareBps).catch((e) => ({
        ok: false, message: e instanceof Error ? e.message : "claim failed", digest: null, claimedSui: 0,
      }));
      results.push(
        outcome.ok && outcome.digest
          ? `$${row.symbol}: ${outcome.claimedSui.toFixed(4)} SUI split 80/10/10 ✅ suiscan.xyz/mainnet/tx/${outcome.digest}`
          : `$${row.symbol}: ${outcome.message}`,
      );
      continue;
    }
    if (!vault && row.launchpad === "perpsplexity") {
      // Perpsplexity: the bot is the pool creator; pay_creator then 80/10/10 in USDC.
      const { feeRouting } = await import("./xLauncher.server");
      const { claimPerpsCreatorFees } = await import("./perps-claim.server");
      const routing = await feeRouting(row.x_username, { handle: row.fee_receiver_x_username, wallet: row.fee_receiver_wallet });
      const { findPerpsPoolId } = await import("./perps-claim.server");
      const poolId = row.pool_object_id ?? (await findPerpsPoolId((row as { tx_digest?: string | null }).tx_digest ?? null));
      if (!poolId) { results.push(`$${row.symbol}: pool not found for this launch`); continue; }
      const outcome = await claimPerpsCreatorFees(poolId, routing.payees, routing.shareBps).catch((e) => ({
        ok: false, message: e instanceof Error ? e.message : "claim failed", digest: null, claimedUsdc: 0,
      }));
      results.push(
        outcome.ok && outcome.digest
          ? `$${row.symbol}: ${outcome.claimedUsdc.toFixed(2)} USDC split 80/10/10 ✅ suiscan.xyz/mainnet/tx/${outcome.digest}`
          : `$${row.symbol}: ${outcome.message}`,
      );
      continue;
    }
    if (!vault) {
      results.push(`$${row.symbol}: fees on ${row.launchpad} can't be claimed by the bot yet`);
      continue;
    }
    if (vault.pendingSui <= 0) {
      results.push(`$${row.symbol}: no fees waiting yet`);
      continue;
    }
    const outcome = await claimCreatorFeeVault(vault.curveId).catch((e) => ({
      ok: false as const,
      message: e instanceof Error ? e.message : "claim failed",
    }));
    results.push(
      outcome.ok && outcome.digest
        ? `$${row.symbol}: ${outcome.claimedSui.toFixed(4)} SUI distributed ✅ suiscan.xyz/mainnet/tx/${outcome.digest}`
        : `$${row.symbol}: claim failed — ${outcome.message}. Try again from the terminal.`,
    );
  }

  if (results.length === 0) return `@${username} none of your tokens have creator fees waiting right now.`;
  const note = request.redirectAsked ? " Fees always pay the recipient locked in at launch." : "";
  return `@${username} ${results.join(" · ")}${note}`.slice(0, 280);

}

/** Replies with pending creator fees for the author's tokens. Sends no transaction. */
export async function handleFeeCheckMention(username: string, text: string): Promise<string | null> {
  const request = readFeeCheckRequest(text);
  if (!request) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: launches } = await supabaseAdmin
    .from("x_launch_requests")
    .select("symbol, token_address, launchpad, x_username, fee_receiver_x_username, fee_receiver_wallet, pool_object_id, tx_digest, maelstrom_launch_id, fees_paid_coin, fees_paid_quote, status")
    .eq("status", "DEPLOYED")
    .order("created_at", { ascending: false })
    .limit(500);
  const mine = (launches ?? []).filter(
    (row) => same(row.x_username, username) || same(row.fee_receiver_x_username, username),
  );
  if (mine.length === 0) return `@${username} no tokens launched from your X account yet, so no creator fees to show.`;
  const targets = request.symbol ? mine.filter((row) => row.symbol.toUpperCase() === request.symbol) : mine;
  if (targets.length === 0) return `@${username} $${request.symbol} wasn't launched from your account.`;

  const { listCreatorFeeVaults } = await import("./creatorClaim.server");
  const vaults = await listCreatorFeeVaults().catch(() => null);
  if (!vaults) return `@${username} couldn't read fee balances from the chain right now. Try again shortly.`;

  let total = 0;
  const parts: string[] = [];
  for (const row of targets) {
    const vault = vaults.find(
      (v) =>
        (row.token_address && v.curveId.toLowerCase() === row.token_address.toLowerCase()) ||
        v.symbol === row.symbol.toUpperCase(),
    );
    if (!vault && row.launchpad === "maelstrom" && row.pool_object_id) {
      const { findMaelstromLaunchId, maelstromOwed } = await import("./maelstrom-claim.server");
      const launchId = row.maelstrom_launch_id ?? (await findMaelstromLaunchId(row.pool_object_id));
      const owed = launchId
        ? await maelstromOwed(launchId, BigInt(String(row.fees_paid_coin ?? 0).split(".")[0] || "0"), BigInt(String(row.fees_paid_quote ?? 0).split(".")[0] || "0"))
        : null;
      const sym = owed?.fees.quoteType.split("::").pop() ?? "SUI";
      const q = owed ? Number(owed.owedQuote) / (sym === "SUI" ? 1e9 : 1e6) : 0;
      if (sym === "SUI") total += q;
      parts.push(`$${row.symbol}: ${q.toFixed(4)} ${sym} + ${row.symbol}`);
      continue;
    }
    if (!vault && row.launchpad === "popular" && row.pool_object_id) {
      const { readPopularCurveFees } = await import("./popular-claim.server");
      const fees = await readPopularCurveFees(row.pool_object_id);
      const sui = fees ? Number(fees.pendingMist) / 1e9 : 0;
      total += sui;
      parts.push(`$${row.symbol}: ${sui.toFixed(4)} SUI`);
      continue;
    }
    if (!vault && row.launchpad === "perpsplexity") {
      const { readPerpsPoolFees, findPerpsPoolId } = await import("./perps-claim.server");
      const poolId = row.pool_object_id ?? (await findPerpsPoolId(row.tx_digest ?? null));
      const fees = poolId ? await readPerpsPoolFees(poolId) : null;
      if (!fees) {
        parts.push(`$${row.symbol}: couldn't read the pool right now`);
        continue;
      }
      parts.push(`$${row.symbol}: ${(Number(fees.pendingUnits) / 1e6).toFixed(2)} USDC`);
      continue;
    }
    if (!vault) {
      parts.push(`$${row.symbol}: not readable on ${row.launchpad}`);
      continue;
    }
    total += vault.pendingSui;
    parts.push(`$${row.symbol}: ${vault.pendingSui.toFixed(4)} SUI`);
  }
  const head = targets.length > 1 && total > 0 ? `${total.toFixed(4)} SUI waiting in total · ` : "";
  const tail = total > 0 ? ` — reply "claim my fees" to release.` : "";
  return `@${username} ${head}${parts.join(" · ")}${tail}`.slice(0, 280);
}
