// SPDX-License-Identifier: BUSL-1.1
/**
 * Telegram alerts: tells a user when a launch on their watchlist reaches a final
 * state (deployed / failed). Each watch row stores the last status it reported,
 * so a status is only ever sent once.
 */
const FINAL = new Set(["DEPLOYED", "FAILED", "UNAVAILABLE"]);

export function alertText(l: { symbol: string; status: string; launchpad: string; token_url: string | null }) {
  const ok = l.status === "DEPLOYED";
  return ok
    ? `✅ $${l.symbol} is live on ${l.launchpad}${l.token_url ? `\n${l.token_url}` : ""}`
    : `⚠️ $${l.symbol} launch on ${l.launchpad} did not complete (${l.status.toLowerCase()}).`;
}

export async function maintainTgAlerts() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: watches } = await db.from("tg_watchlist").select("id, tg_user_id, launch_id, notified_status").limit(500);
  if (!watches?.length) return;
  const ids = [...new Set(watches.map((w) => w.launch_id))];
  const { data: launches } = await db.from("x_launch_requests").select("id, symbol, status, launchpad, token_url").in("id", ids);
  const byId = new Map((launches ?? []).map((l) => [l.id, l]));

  for (const w of watches) {
    const l = byId.get(w.launch_id);
    if (!l || !FINAL.has(l.status) || w.notified_status === l.status) continue;
    // Claim first so a concurrent poll can't send the same alert twice.
    const { data: claimed } = await db.from("tg_watchlist").update({ notified_status: l.status }).eq("id", w.id)
      .or(w.notified_status ? `notified_status.eq.${w.notified_status}` : "notified_status.is.null").select("id");
    if (!claimed?.length) continue;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: w.tg_user_id, text: alertText(l), disable_web_page_preview: false }),
    });
    if (!res.ok) console.error(`[tg-alert] send failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  }
}

const GQL = "https://graphql.mainnet.sui.io/graphql";
const TX_Q = `query($a:SuiAddress!){transactions(last:5,filter:{sentAddress:$a}){nodes{digest effects{status balanceChanges{nodes{owner{address} coinType{repr} amount}} objectChanges{nodes{outputState{asMovePackage{address}}}}}}}}`;
type TxNode = { digest: string; effects?: { status?: string; balanceChanges?: { nodes: { owner?: { address?: string } | null; coinType?: { repr?: string }; amount: string }[] }; objectChanges?: { nodes: { outputState?: { asMovePackage?: { address?: string } | null } | null }[] } } };

/** Dev-wallet alerts: new transactions *sent by* a followed wallet. Alert only — never trades. */
export async function maintainWalletFollows() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return;
  const { describeActivity } = await import("./walletWatch");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: follows } = await db.from("tg_wallet_follows").select("id, tg_user_id, address, label, last_digest, copy_sui, copy_daily_cap, copy_slippage, copy_day, copy_spent").limit(300);
  const copy = await import("./copyTrade");
  const say = (chat_id: number, text: string) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }) });
  const byAddr = new Map<string, typeof follows>();
  for (const f of follows ?? []) byAddr.set(f.address, [...(byAddr.get(f.address) ?? []), f]);
  for (const [address, list] of byAddr) {
    const res = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: TX_Q, variables: { a: address } }) }).catch(() => null);
    if (!res?.ok) continue;
    const nodes = ((await res.json().catch(() => null)) as { data?: { transactions?: { nodes: TxNode[] } } } | null)?.data?.transactions?.nodes;
    if (!nodes?.length) continue;
    const latest = nodes[nodes.length - 1]!.digest;
    for (const f of list ?? []) {
      if (f.last_digest === latest) continue;
      // Claim first so concurrent polls never send the same alert (or copy trade) twice.
      const q = db.from("tg_wallet_follows").update({ last_digest: latest }).eq("id", f.id);
      const { data: claimed } = await (f.last_digest ? q.eq("last_digest", f.last_digest) : q.is("last_digest", null)).select("id");
      if (!claimed?.length || !f.last_digest) continue; // first sighting only sets the baseline
      const idx = nodes.findIndex((n) => n.digest === f.last_digest);
      const fresh = (idx >= 0 ? nodes.slice(idx + 1) : nodes).filter((n) => n.effects?.status === "SUCCESS");
      const name = f.label ? `${f.label} (${address.slice(0, 6)}…${address.slice(-4)})` : `${address.slice(0, 6)}…${address.slice(-4)}`;
      let spent = Number(f.copy_spent ?? 0), day = f.copy_day as string | null;
      for (const n of fresh) {
        const changes = (n.effects?.balanceChanges?.nodes ?? []).map((c) => ({ owner: c.owner?.address ?? null, coinType: c.coinType?.repr ?? "", amount: c.amount }));
        const pkgs = (n.effects?.objectChanges?.nodes ?? []).map((o) => o.outputState?.asMovePackage?.address).filter((x): x is string => !!x);
        const text = `👀 ${name}\n${describeActivity(address, changes, pkgs)}\nhttps://suiscan.xyz/mainnet/tx/${n.digest}`;
        const r = await say(f.tg_user_id, text);
        if (!r.ok) console.error(`[tg-follow] send failed [${r.status}]`);
        // Copy trade: only when the user opted in for this wallet, within the daily cap.
        const lead = f.copy_sui ? copy.leaderTrade(address, changes) : null;
        if (!lead) continue;
        const today = new Date().toISOString().slice(0, 10);
        let cmd: string;
        if (lead.side === "buy") {
          const amt = copy.copyBudget(Number(f.copy_sui), Number(f.copy_daily_cap ?? f.copy_sui), day, spent, today);
          if (!amt) { await say(f.tg_user_id, `🪞 Copy skipped: daily max of ${f.copy_daily_cap} SUI reached.`); continue; }
          spent = (day === today ? spent : 0) + amt; day = today;
          await db.from("tg_wallet_follows").update({ copy_spent: spent, copy_day: today }).eq("id", f.id);
          cmd = `buy ${amt} sui of ${lead.coinType} slippage ${f.copy_slippage ?? 10}%`;
        } else cmd = `sell 100% ${lead.coinType}`;
        const { runTgCommand } = await import("./runCommand.server");
        const out = await runTgCommand(f.tg_user_id, cmd).then((x) => x.reply).catch((e) => `Failed: ${(e as Error).message}. Nothing was sent unless a transaction link is shown.`);
        await say(f.tg_user_id, `🪞 Copy ${lead.side} of $${lead.coinType.split("::").pop()}\n${out}`);
      }
    }
  }
}
