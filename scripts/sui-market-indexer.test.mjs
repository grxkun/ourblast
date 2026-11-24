// SPDX-License-Identifier: BUSL-1.1
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("daemon pages past a burst before advancing its saved watermark", async () => {
  const dir = await mkdtemp(join(tmpdir(), "market-indexer-"));
  const path = join(dir, "state.json");
  const requests = [];
  const server = createServer(async (req, res) => {
    let text = ""; for await (const part of req) text += part;
    if (req.url === "/api/public/snipe-trigger") {
      assert.equal(req.headers.authorization, "Bearer test-fixture-only");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true })); return;
    }
    const body = JSON.parse(text); requests.push(body);
    const count = requests.filter((r) => r.source === body.source).length;
    const burst = body.source === "suipump-v17" && count === 2;
    const caught = body.before === "catch-up";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ saved: 25, hasMore: burst, before: burst ? "catch-up" : null,
      newest: burst || caught ? "2026-11-21T12:00:00Z" : "2026-11-21T10:00:00Z",
      oldest: caught ? "2026-11-21T09:00:00Z" : burst ? "2026-11-21T11:00:00Z" : "2026-11-21T10:00:00Z" }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const child = spawn(process.execPath, ["scripts/sui-market-indexer.mjs"], { env: { ...process.env,
    OURBLAST_INDEXER_ORIGIN: `http://localhost:${address.port}`, SUI_INDEXER_SECRET: "test-fixture-only", INDEXER_STATE_PATH: path }, stdio: "ignore" });
  try {
    let state = {};
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      try { state = JSON.parse(await readFile(path, "utf8")); } catch { continue; }
      if (state["suipump-v17"]?.latest === "2026-11-21T12:00:00Z") break;
    }
    assert.deepEqual(requests.filter((r) => r.source === "suipump-v17").map((r) => r.before), [null, null, "catch-up"]);
    assert.equal(state["suipump-v17"]?.latest, "2026-11-21T12:00:00Z");
    assert.equal(state["popular"]?.done, true);
  } finally {
    child.kill(); await new Promise((r) => child.once("exit", r));
    await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true });
  }
});