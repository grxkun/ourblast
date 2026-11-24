// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { maintainChannelSignals, readMigration, sendChannelSignal } from "./notifierSignals.server";
import { canonicalCoin } from "./market";
const m = vi.hoisted(() => ({ telegram: vi.fn(), metadata: vi.fn(), curve: vi.fn(), fresh: vi.fn(), from: vi.fn(), rpc: vi.fn(), suipump: vi.fn(), launches: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: m.from, rpc: m.rpc } }));
vi.mock("./launchNotifier.server", () => ({ telegram: m.telegram, notifierMetadata: m.metadata, maintainLaunchNotifications: m.launches }));
vi.mock("./autoSnipe.server", () => ({ freshLaunches: m.fresh }));
vi.mock("./curvePrice.server", () => ({ readCurve: m.curve }));
vi.mock("@/lib/terminal/sui-balances.server", () => ({ readCoinMetadata: vi.fn().mockResolvedValue({ symbol: "TEST", decimals: 6 }) }));
vi.mock("./runCommand.server", () => ({ aftermathPrices: vi.fn().mockResolvedValue({ "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI": 1 }) }));
vi.mock("@/lib/terminal/suipump.server", () => ({ listSuipumpTokens: m.suipump }));
vi.mock("./scanInfo.server", () => ({ getScanStats: vi.fn().mockResolvedValue({ symbol: "TEST", priceUsd: 1, mcap: null, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, devSui: 5 }) }));
const coin = canonicalCoin("0x1::test::TEST") ?? "invalid";
const now = Date.parse("2026-11-24T08:00:00Z");
let monitor: { coin_type: string; source: string; checked_at: string; last_progress: number | null; migrated: boolean };
let deliveries: Record<string, Record<string, unknown>>;
let observations: Record<string, unknown>[];
const db = { from: m.from, rpc: m.rpc } as unknown as Parameters<typeof sendChannelSignal>[0];
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("TELEGRAM_BOT_TOKEN", "fixture-only");
  monitor = { coin_type: coin, source: "blast", checked_at: new Date(now - 60_000).toISOString(), last_progress: .49, migrated: false };
  deliveries = {}; observations = [];
  m.telegram.mockResolvedValue({ message_id: 21 }); m.metadata.mockResolvedValue({ photo: "https://example.com/test.png", socials: "" });
  m.fresh.mockResolvedValue([]); m.launches.mockResolvedValue(undefined);
  m.curve.mockResolvedValue({ live: true, progress: .6, reserveSui: 600, priceSui: 1 });
  m.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ data: { objects: { nodes: [{ asMoveObject: { contents: { json: { lifecycle: { "@variant": "Live" } } } } }] } } })));
  m.from.mockImplementation((table: string) => {
    let op = "select", value: Record<string, unknown> = {}, key = "";
    const result = () => {
      if (op === "insert" && table === "tg_notifier_signal_deliveries") {
        const k = String(value["signal_key"]);
        if (deliveries[k]) return { data: null, error: { code: "23505" } };
        deliveries[k] = { ...value }; return { data: null, error: null };
      }
      if (op === "update") {
        const delivery = deliveries[key];
        if (table === "tg_notifier_signal_deliveries" && delivery) Object.assign(delivery, value);
        if (table === "tg_notifier_monitors") Object.assign(monitor, value);
      }
      if (op === "insert" && table === "tg_notifier_observations") observations.push(value);
      return { data: table === "tg_notifier_monitors" ? [{ ...monitor }] : [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "gte", "lt"]) chain[method] = vi.fn(() => chain);
    chain["eq"] = vi.fn((field: string, v: string) => { if (field === "signal_key") key = v; return chain; });
    chain["insert"] = vi.fn((v: Record<string, unknown>) => { op = "insert"; value = v; return chain; });
    chain["update"] = vi.fn((v: Record<string, unknown>) => { op = "update"; value = v; return chain; });
    chain["delete"] = vi.fn(() => { op = "delete"; return chain; });
    chain["upsert"] = vi.fn(() => chain);
    chain["single"] = vi.fn(async () => ({ data: { started_at: new Date(now - 10 * 60_000).toISOString() }, error: null }));
    chain["maybeSingle"] = vi.fn(async () => ({ data: { id: "channel" }, error: null }));
    chain["limit"] = vi.fn(async () => result());
    chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("notification delivery", () => {
  it("posts the 50% crossing with image, saves receipt and observed progress, and never repeats", async () => {
    await maintainChannelSignals();
    expect(m.telegram.mock.calls[0]?.[0]).toBe("sendPhoto");
    expect(deliveries[`half:${coin}`]?.["status"]).toBe("sent");
    expect(deliveries[`half:${coin}`]?.["message_id"]).toBe(21);
    expect(monitor.last_progress).toBe(.6);
    expect(observations[0]?.["progress"]).toBe(.6);
    const calls = m.telegram.mock.calls.length;
    await maintainChannelSignals();
    expect(m.telegram).toHaveBeenCalledTimes(calls);
    expect(observations).toHaveLength(2);
  });
  it("retains an ambiguous delivery and does not replay the same signal", async () => {
    m.telegram.mockRejectedValueOnce(new Error("timeout"));
    await sendChannelSignal(db, "half:test", "half", "test");
    expect(deliveries["half:test"]?.["status"]).toBe("uncertain");
    await sendChannelSignal(db, "half:test", "half", "test");
    expect(m.telegram).toHaveBeenCalledTimes(1);
  });
  it("does no work when another listener owns the lease", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    await maintainChannelSignals();
    expect(m.fresh).not.toHaveBeenCalled(); expect(m.telegram).not.toHaveBeenCalled();
  });
  it("uses a first observation above 50% as baseline, not a historical crossing", async () => {
    monitor.last_progress = null;
    await maintainChannelSignals();
    expect(m.telegram).not.toHaveBeenCalled();
    expect(monitor.last_progress).toBe(.6);
  });
});
describe("migration proof", () => {
  it("does not classify MigrationReady as migration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { objects: { nodes: [{ asMoveObject: { contents: { json: { lifecycle: { "@variant": "MigrationReady" } } } } }] } } })));
    expect(await readMigration(coin, "blast")).toBe(false);
  });
  it("requires Suipump's recorded pool, not the graduated flag alone", async () => {
    m.suipump.mockResolvedValue([{ tokenType: coin, graduated: true, poolId: null }]);
    expect(await readMigration(coin, "suipump")).toBe(false);
    m.suipump.mockResolvedValue([{ tokenType: coin, graduated: true, poolId: "0x5" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { object: { asMoveObject: { contents: { type: { repr: `0x3::pool::Pool<${coin}, 0x2::sui::SUI>` } } } } } })));
    expect(await readMigration(coin, "suipump")).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { object: { asMoveObject: { contents: { type: { repr: "0x3::pool::Pool<0x1::test::Test, 0x2::sui::SUI>" } } } } } })));
    expect(await readMigration(coin, "suipump")).toBe(false);
  });
});