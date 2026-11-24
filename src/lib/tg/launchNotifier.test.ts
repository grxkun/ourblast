// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifierEligible, notifierSocials, publicUrl } from "./launchNotifier";
import { maintainLaunchNotifications } from "./launchNotifier.server";
const mocks = vi.hoisted(() => ({ from: vi.fn(), stats: vi.fn(), updates: [] as Record<string, unknown>[], rows: [] as { coin_type: string; launched_at: string; launchpad: string | null }[], won: true }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./scanInfo.server", () => ({ getScanStats: mocks.stats }));
const launch = { pad: "blast" as const, coinType: "0x1::cant::CANT", symbol: "CANT", name: "Cant", createdMs: Date.parse("2026-11-24T01:00:00Z"), ts: "2026-11-24T01:00:00Z" };
const stats = { priceUsd: 0.001, mcap: 1000000, liquidity: null, volume24h: null, change24h: null, dex: null, pools: 0, symbol: "CANT" };
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-only-not-a-real-token");
  mocks.rows = [{ coin_type: launch.coinType, launched_at: launch.ts, launchpad: "blast" }]; mocks.updates = []; mocks.won = true;
  mocks.stats.mockResolvedValue(stats);
  mocks.from.mockImplementation((table: string) => {
    let update: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain), order: vi.fn(() => chain),
      single: vi.fn().mockResolvedValue({ data: { started_at: "2026-11-24T00:59:00Z" }, error: null }),
      limit: vi.fn(async () => ({ data: mocks.rows, error: null })),
      maybeSingle: vi.fn(async () => ({ data: mocks.won ? { coin_type: launch.coinType } : null, error: null })),
      update: vi.fn((value: Record<string, unknown>) => { update = value; mocks.updates.push(value); return chain; }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, table, update }).then(resolve),
    };
    return chain;
  });
});
function fakeFetch(deliver: (method: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string) => url.includes("graphql.mainnet") ? Response.json({ data: { coinMetadata: { iconUrl: "https://example.com/token.png", description: "https://x.com/cant" } } }) : deliver(url.split("/").pop() ?? ""));
  vi.stubGlobal("fetch", fn); return fn;
}
describe("notifier rules", () => {
  it("starts at activation and excludes history, future events and launches older than ten minutes", () => {
    const now = launch.createdMs + 1000;
    expect(notifierEligible(launch, launch.createdMs, now)).toBe(true);
    expect(notifierEligible(launch, launch.createdMs + 1, now)).toBe(false);
    expect(notifierEligible(launch, 0, launch.createdMs + 600001)).toBe(false);
    expect(notifierEligible(launch, 0, launch.createdMs - 1)).toBe(false);
  });
  it("rejects invalid contracts without folding case-sensitive identities", () => {
    expect(notifierEligible({ ...launch, coinType: "0x1" }, 0, launch.createdMs)).toBe(false);
    expect(notifierEligible({ ...launch, coinType: "0x1::cant::Cant" }, 0, launch.createdMs)).toBe(true);
  });
  it("accepts public HTTPS/IPFS images but rejects credentials and private hosts", () => {
    expect(publicUrl("ipfs://abc/icon.png")).toBe("https://ipfs.io/ipfs/abc/icon.png");
    for (const u of ["http://example.com", "https://127.0.0.1/x", "https://user:pass@example.com", "javascript:alert(1)"]) expect(publicUrl(u)).toBeNull();
  });
  it("uses only present social URLs, deduplicates platforms and rejects injected protocols", () => {
    const s = notifierSocials("https://x.com/cant https://t.me/cant", { website: "javascript:alert(1)", twitter: "https://x.com/official" });
    expect(s).toContain("https://x.com/official"); expect(s).not.toContain("https://x.com/cant"); expect(s).not.toContain("javascript:");
  });
});
describe("notifier delivery claims", () => {
  it("does not guess a launchpad for old queue rows missing provenance", async () => {
    mocks.rows = [{ coin_type: launch.coinType, launched_at: launch.ts, launchpad: null }];
    const fetch = fakeFetch(() => Response.json({ ok: true, result: { message_id: 21 } }));
    await maintainLaunchNotifications([]);
    expect(fetch.mock.calls.filter(([u]) => u.includes("api.telegram.org"))).toHaveLength(0);
  });
  it("posts an image with scan caption and records Telegram receipt", async () => {
    const fetch = fakeFetch(() => Response.json({ ok: true, result: { message_id: 21 } }));
    await maintainLaunchNotifications([launch]);
    expect(fetch.mock.calls.some(([u]) => u.endsWith("/sendPhoto"))).toBe(true);
    expect(mocks.updates).toContainEqual(expect.objectContaining({ status: "sent", message_id: 21 }));
  });
  it("sends nothing when another poller has claimed the token", async () => {
    mocks.won = false;
    const fetch = fakeFetch(() => Response.json({ ok: true, result: { message_id: 21 } }));
    await maintainLaunchNotifications([launch]);
    expect(fetch.mock.calls.filter(([u]) => u.includes("api.telegram.org"))).toHaveLength(0);
  });
  it("never retries an ambiguous network outcome", async () => {
    const fetch = fakeFetch(() => Promise.reject(new Error("network")));
    await maintainLaunchNotifications([launch]);
    expect(fetch.mock.calls.filter(([u]) => u.includes("api.telegram.org"))).toHaveLength(1);
    expect(mocks.updates).toContainEqual(expect.objectContaining({ status: "uncertain" }));
  });
  it("falls back to a text scan only after a definite invalid-photo rejection", async () => {
    const fetch = fakeFetch((method) => method === "sendPhoto" ? Response.json({ ok: false, error_code: 400, description: "wrong file" }, { status: 400 }) : Response.json({ ok: true, result: { message_id: 22 } }));
    await maintainLaunchNotifications([launch]);
    expect(fetch.mock.calls.filter(([u]) => u.includes("api.telegram.org"))).toHaveLength(2);
    expect(mocks.updates).toContainEqual(expect.objectContaining({ status: "sent", message_id: 22 }));
  });
  it("does not fall back after Telegram server errors", async () => {
    const fetch = fakeFetch(() => Response.json({ ok: false, error_code: 500 }, { status: 500 }));
    await maintainLaunchNotifications([launch]);
    expect(fetch.mock.calls.filter(([u]) => u.includes("api.telegram.org"))).toHaveLength(1);
    expect(mocks.updates).toContainEqual(expect.objectContaining({ status: "uncertain" }));
  });
  it("retains the image receipt when an oversized scan's follow-up fails", async () => {
    mocks.stats.mockResolvedValue({ ...stats, name: "N".repeat(1000) });
    fakeFetch((method) => method === "sendPhoto" ? Response.json({ ok: true, result: { message_id: 23 } }) : Promise.reject(new Error("network")));
    await maintainLaunchNotifications([launch]);
    expect(mocks.updates).toContainEqual(expect.objectContaining({ status: "uncertain", message_id: 23 }));
  });
});