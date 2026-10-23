// SPDX-License-Identifier: BUSL-1.1
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("Solana RPC fallback", () => {
  it("tries PublicNode and Vibe Station before the configured endpoint", async () => {
    vi.stubEnv("SOLANA_RPC_URL", "https://configured.example/private-key");
    const { solRpcEndpoints } = await import("./sol-rpc.server");
    expect(solRpcEndpoints().slice(0, 2)).toEqual(["https://solana-rpc.publicnode.com", "https://solanavibestation.com"]);
    expect(solRpcEndpoints().at(-1)).toBe("https://configured.example/private-key");
  });

  it("falls back on HTTP 403 and JSON provider blocking", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Your IP or provider is blocked from this endpoint" } }))
      .mockResolvedValueOnce(Response.json({ result: { value: 325594678 } }));
    vi.stubGlobal("fetch", fetcher);
    const { solRpc } = await import("./sol-rpc.server");
    expect(await solRpc("getBalance", ["wallet"])).toEqual({ value: 325594678 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("skips an unavailable endpoint on the next request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429 }))
      .mockImplementation(async () => Response.json({ result: 1 }));
    vi.stubGlobal("fetch", fetcher);
    const { solRpc } = await import("./sol-rpc.server");
    await solRpc("getBalance", []);
    await solRpc("getBalance", []);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://solana-rpc.publicnode.com", "https://solanavibestation.com", "https://solanavibestation.com",
    ]);
  });

  it("retries broadcast with the identical signed payload, never building another transaction", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(Response.json({ result: "signature" }));
    vi.stubGlobal("fetch", fetcher);
    const { solRpc } = await import("./sol-rpc.server");
    expect(await solRpc("sendTransaction", ["same-signed-payload", { encoding: "base64" }])).toBe("signature");
    const first = fetcher.mock.calls[0]?.[1];
    const second = fetcher.mock.calls[1]?.[1];
    expect(first?.body).toBeDefined();
    expect(first?.body).toBe(second?.body);
  });

  it("does not expose credentials or provider errors when every endpoint fails", async () => {
    vi.stubEnv("SOLANA_RPC_URL", "https://configured.example/private-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-key")));
    const { solRpc } = await import("./sol-rpc.server");
    await expect(solRpc("getBalance", [])).rejects.toThrow("Solana connection unavailable");
    await expect(solRpc("getBalance", [])).rejects.not.toThrow("private-key");
  });
});