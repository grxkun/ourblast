/**
 * "@ourblastbot claim fees $TICKER" — lets the X account that launched a token
 * (or the account its fees were redirected to) release the accumulated creator
 * fees straight from X. The claim always pays the payees fixed on chain at
 * launch, so a tweet can trigger a payout but can never redirect one.
 */

const CLAIM_PATTERN = /\bcla[io]?m\w*\b[^$]*?\bfees?\b|\bcla[io]?m\w*\b\s+\$[a-z0-9]+/i;

export function readFeeClaimRequest(text: string): { symbol: string | null } | null {
  if (!CLAIM_PATTERN.test(text)) return null;
  if (/\b(deploy|launch|send|buy|sell)\b/i.test(text)) return null;
  const tag = text.match(/\$([a-z][a-z0-9]{0,15})\b/i);
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
    .select("symbol, token_address, launchpad, x_username, fee_receiver_x_username, status")
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
  return `@${username} ${results.join(" · ")}`.slice(0, 280);
}
