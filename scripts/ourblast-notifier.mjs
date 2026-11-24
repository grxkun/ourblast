// SPDX-License-Identifier: BUSL-1.1
// Node 22+ VPS listener. No keys, signing, trades or X calls; authenticated notifications only.
import { pathToFileURL } from "node:url";
export async function notifierTick(origin, secret, request = fetch) {
  const url = new URL("/api/public/notifier-trigger", origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Notifier requires HTTPS");
  if (!secret) throw new Error("SUI_INDEXER_SECRET is required");
  const r = await request(url, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(110_000) });
  if (!r.ok) throw new Error(`Notifier HTTP ${r.status}`);
  const body = await r.json();
  if (body.ok !== true) throw new Error("Notifier did not complete");
}
export async function runNotifierListener() {
  const origin = process.env.OURBLAST_INDEXER_ORIGIN;
  const secret = process.env.SUI_INDEXER_SECRET;
  if (!origin || !secret) throw new Error("Set OURBLAST_INDEXER_ORIGIN and SUI_INDEXER_SECRET");
  let failures = 0;
  for (;;) {
    try { await notifierTick(origin, secret); failures = 0; console.log("Notifier check completed"); }
    catch (e) { failures++; console.error(e.message); }
    // Sequential ticks, bounded backoff; restart is handled by the VPS supervisor.
    await new Promise((resolve) => setTimeout(resolve, Math.min(120_000, 15_000 * 2 ** Math.min(failures, 3))));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runNotifierListener();