// SPDX-License-Identifier: BUSL-1.1
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { createPublicClient, erc20Abi, http, type Hex } from "viem";

import { SWEEP_CHAINS, type SweepChain } from "./evm-sweep";
import { SOL_USDC_MINT } from "./sol-sweep";

export interface ChainBalance { chain: string; eth: number; usdc: number | null; native: "ETH" | "BNB" }

export async function evmBalances(address: string): Promise<ChainBalance[]> {
  return Promise.all(
    (Object.keys(SWEEP_CHAINS) as SweepChain[]).map(async (chain) => {
      const c = SWEEP_CHAINS[chain];
      const pc = createPublicClient({ transport: http(c.rpc, { timeout: 10_000 }) });
      const eth = await pc.getBalance({ address: address as Hex }).catch(() => 0n);
      const usdc = c.usdc
        ? await pc.readContract({ address: c.usdc as Hex, abi: erc20Abi, functionName: "balanceOf", args: [address as Hex] }).catch(() => 0n)
        : null;
      return { chain, native: c.native, eth: Number(eth) / 1e18, usdc: usdc === null ? null : Number(usdc) / 1e6 };
    }),
  );
}

const SOL_RPCS = () =>
  [
    process.env["SOLANA_RPC_URL"],
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.api.onfinality.io/public",
  ].filter(Boolean) as string[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tries each Solana RPC in turn, then retries the whole list once after a pause; public endpoints throttle edge IPs. */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await sleep(1_200);
    for (const url of SOL_RPCS()) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 429 || res.status === 403) throw new Error(`Solana RPC ${method}: rate limited (${res.status})`);
        const json = (await res.json()) as { result?: T; error?: { message: string } };
        if (json.error || json.result === undefined) throw new Error(`Solana RPC ${method}: ${json.error?.message ?? res.status}`);
        return json.result;
      } catch (e) { last = e; }
    }
  }
  throw new Error("Solana network is congested right now — please try again in a moment.");
}

export async function solBalances(address: string): Promise<{ sol: number; usdc: number }> {
  const bal = await rpc<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
  const toks = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
    "getTokenAccountsByOwner", [address, { mint: SOL_USDC_MINT }, { encoding: "jsonParsed", commitment: "confirmed" }],
  ).catch(() => ({ value: [] })); // a USDC lookup failure must never hide the SOL balance
  const usdc = toks.value.reduce((n, a) => n + Number(a.account.data.parsed.info.tokenAmount.amount), 0);
  return { sol: bal.value / 1e9, usdc: usdc / 1e6 };
}

/** Phantom/Solflare import format: base58(seed ‖ pubkey), 64 bytes. */
export function solExportKey(seedHex: string): string {
  const seed = Uint8Array.from(Buffer.from(seedHex, "hex"));
  const out = new Uint8Array(64);
  out.set(seed, 0);
  out.set(ed25519.getPublicKey(seed), 32);
  return bs58.encode(out);
}
