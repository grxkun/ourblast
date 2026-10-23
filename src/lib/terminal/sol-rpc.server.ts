// SPDX-License-Identifier: BUSL-1.1
/** Shared RPC pool for bridge reads, simulation and broadcast of the same signed transaction. */
const PUBLIC_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://solanavibestation.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana.api.onfinality.io/public",
];
const unavailableUntil = new Map<string, number>();

export function solRpcEndpoints(): string[] {
  const configured = process.env["SOLANA_RPC_URL"];
  return [...new Set([...PUBLIC_RPCS, ...(configured ? [configured] : [])])];
}

export async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  const endpoints = solRpcEndpoints();
  const available = endpoints.filter((url) => (unavailableUntil.get(url) ?? 0) <= Date.now());
  // A temporary outage must not disable the pool permanently.
  for (const url of available.length ? available : endpoints) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        unavailableUntil.set(url, Date.now() + 60_000);
        continue;
      }
      const json = await response.json() as { result?: T; error?: { message?: string } };
      if (json.error || json.result === undefined) {
        unavailableUntil.set(url, Date.now() + 60_000);
        continue;
      }
      unavailableUntil.delete(url);
      return json.result;
    } catch {
      unavailableUntil.set(url, Date.now() + 60_000);
    }
  }
  // Never expose a configured RPC URL, which can contain credentials.
  throw new Error("Solana connection unavailable — check bridge history before retrying; transaction status may be unavailable.");
}