// SPDX-License-Identifier: BUSL-1.1
// Optional VPS worker: verified catalog ingestion only. Never signs transactions.
import { readFile, writeFile, rename } from "node:fs/promises";
const origin = process.env.OURBLAST_INDEXER_ORIGIN;
const secret = process.env.SUI_INDEXER_SECRET;
if (!origin || !secret) throw new Error("Set OURBLAST_INDEXER_ORIGIN and SUI_INDEXER_SECRET before starting.");
const url = new URL("/api/public/indexer", origin);
if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Indexer requires HTTPS.");
const sources = ["suipump-v17", "suipump-v18", "blast", "popular", "perpsplexity"];
const statePath = process.env.INDEXER_STATE_PATH || "./sui-market-cursors.json";
let state = {};
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
async function sync(source, before = null) {
  const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ source, before }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Indexer returned HTTP ${r.status}; cursor preserved`);
  const page = await r.json();
  if (typeof page.saved !== "number" || typeof page.hasMore !== "boolean") throw new Error("Invalid indexer response");
  console.log(`${source}: ${page.saved} tokens saved`); return page;
}
async function saveState() {
  await writeFile(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await rename(`${statePath}.tmp`, statePath);
}
await sync("main");
// Fast auto-snipe trigger loop (every 3s). Server dedups fills, so overlap never double-buys.
const trigger = new URL("/api/public/snipe-trigger", origin);
(async () => { for (;;) {
  try { const r = await fetch(trigger, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30000) }); if (!r.ok) console.error(`snipe-trigger: HTTP ${r.status}`); }
  catch (e) { console.error(`snipe-trigger: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 3000));
} })();
// Backfill resumes at the last successful page after restart; failures never advance.
for (const source of sources) {
  while (!state[source]?.done) {
    try {
      const before = state[source]?.before ?? null;
      const p = await sync(source, before);
      if (p.hasMore && (!p.before || p.before === before)) throw new Error("Cursor did not advance");
      state[source] = { before: p.before, done: !p.hasMore, latest: state[source]?.latest ?? p.newest ?? null }; await saveState();
    } catch (e) { console.error(`${source}: ${e.message}`); await new Promise((r) => setTimeout(r, 10000)); }
  }
}
// Poll the newest page, idempotently. This does not alter auto-snipe cursors or rules.
for (;;) {
  for (const source of sources) {
    try {
      const watermark = state[source]?.latest;
      let before = null, newest = null;
      for (;;) {
        const p = await sync(source, before);
        newest ??= p.newest;
        if (!p.hasMore || (watermark && p.oldest && Date.parse(p.oldest) <= Date.parse(watermark))) break;
        if (!p.before || p.before === before) throw new Error("Catch-up cursor did not advance");
        before = p.before;
      }
      state[source] = { ...state[source], latest: newest ?? watermark ?? null }; await saveState();
    } catch (e) { console.error(`${source}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 2000));
  }
}