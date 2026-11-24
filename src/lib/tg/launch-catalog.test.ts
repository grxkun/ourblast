// SPDX-License-Identifier: BUSL-1.1
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalCoin } from "./market";
import { saveDetectedLaunches } from "./launch-catalog.server";
import { maintainAutoSnipes } from "./autoSnipe.server";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn(), limit: vi.fn(), metadata: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/terminal/sui-balances.server", () => ({ readCoinMetadata: mocks.metadata }));
vi.mock("./launchNotifier.server", () => ({ maintainLaunchNotifications: vi.fn().mockResolvedValue(undefined) }));
const token = "0x1::cant::CANT";
const launch = { pad: "blast" as const, coinType: token, symbol: "CANT", name: "Cant", createdMs: 1795426920000, ts: "2026-11-23T09:42:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.limit.mockResolvedValue({ data: [] });
  mocks.from.mockImplementation(() => ({ upsert: mocks.upsert, select: () => ({ eq: () => ({ limit: mocks.limit }) }) }));
  mocks.metadata.mockResolvedValue({ symbol: "CANT", name: "Cant" });
});

describe("launch discovery catalog", () => {
  it("saves exact contracts, real names, launch times and both venues without merging symbols", async () => {
    await saveDetectedLaunches([launch, { ...launch, pad: "suipump", coinType: "0x2::cant::CANT" }]);
    expect(mocks.from).toHaveBeenCalledWith("sui_market_catalog");
    expect(mocks.upsert).toHaveBeenCalledWith([
      { coin_type: canonicalCoin(token), symbol: "CANT", name: "Cant", source: "Blast.fun", launched_at: launch.ts },
      { coin_type: canonicalCoin("0x2::cant::CANT"), symbol: "CANT", name: "Cant", source: "Suipump", launched_at: launch.ts },
    ], { onConflict: "coin_type", ignoreDuplicates: true });
  });
  it("deduplicates replayed events and rejects invalid identities or timestamps", async () => {
    await saveDetectedLaunches([launch, launch, { ...launch, coinType: "0x123" }, { ...launch, ts: "invalid" }]);
    expect(mocks.upsert.mock.calls[0]?.[0]).toHaveLength(1);
  });
  it("reports catalog write failures", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(saveDetectedLaunches([launch])).rejects.toThrow("could not be saved");
  });
  it("indexes detected launches with no active sniper rules and never accesses trade claims", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: { body: string }) => {
      const body = JSON.parse(options.body) as { variables: { t: string } };
      return Promise.resolve(Response.json({ data: { events: { nodes: body.variables.t.includes("LaunchShared") ? [{ timestamp: launch.ts, contents: { type: { repr: `LaunchShared<${token},0x2::sui::SUI>` }, json: { name: "Cant" } } }] : [] } } }));
    }));
    await maintainAutoSnipes();
    expect(mocks.upsert).toHaveBeenCalledWith([expect.objectContaining({ coin_type: canonicalCoin(token), name: "Cant" })], { onConflict: "coin_type", ignoreDuplicates: true });
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(["sui_market_catalog", "tg_snipe_filters"]);
  });
});