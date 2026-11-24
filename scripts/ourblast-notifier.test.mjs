// SPDX-License-Identifier: BUSL-1.1
import test from "node:test";
import assert from "node:assert/strict";
import { notifierTick } from "./ourblast-notifier.mjs";
test("listener calls only the authenticated notifier, never the trading trigger", async () => {
  let calls = 0;
  await notifierTick("https://example.com", "fixture-only", async (url, options) => {
    calls++; assert.equal(url.pathname, "/api/public/notifier-trigger");
    assert.equal(options.headers.authorization, "Bearer fixture-only");
    return Response.json({ ok: true });
  });
  assert.equal(calls, 1);
});
test("listener reports failed ticks and never retries ambiguous work within the same tick", async () => {
  let calls = 0;
  await assert.rejects(notifierTick("https://example.com", "fixture-only", async () => { calls++; throw new Error("timeout"); }), /timeout/);
  assert.equal(calls, 1);
  await assert.rejects(notifierTick("http://example.com", "fixture-only"), /HTTPS/);
});