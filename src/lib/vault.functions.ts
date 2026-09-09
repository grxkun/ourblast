import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_SUI_CHAIN,
  DEFAULT_TREASURY_ADDRESS,
  MIST_PER_SUI,
  PRIZE_POOL_ADDRESS,
  SUI_FULLNODES,
} from "./ourblast.config";

async function balanceOf(address: string): Promise<number> {
  const url = SUI_FULLNODES[DEFAULT_SUI_CHAIN]!;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getBalance",
        params: [address, "0x2::sui::SUI"],
      }),
    });
    const json = (await res.json()) as { result?: { totalBalance?: string } };
    return Number(json.result?.totalBalance ?? 0) / MIST_PER_SUI;
  } catch {
    return 0;
  }
}

async function suiUsdPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
      { headers: { accept: "application/json" } },
    );
    const json = (await res.json()) as { sui?: { usd?: number } };
    return Number(json.sui?.usd ?? 0);
  } catch {
    return 0;
  }
}

export type VaultSizes = {
  prizePoolSui: number;
  treasurySui: number;
  suiUsd: number;
  updatedAt: number;
};

/** Public read: live on-chain size of the prize pool and community treasury. */
export const getVaultSizes = createServerFn({ method: "GET" }).handler(
  async (): Promise<VaultSizes> => {
    const treasury = (process.env['OURBLAST_TREASURY_ADDRESS'] ?? DEFAULT_TREASURY_ADDRESS)
      .toLowerCase();
    const [prizePoolSui, treasurySui, suiUsd] = await Promise.all([
      balanceOf(PRIZE_POOL_ADDRESS),
      balanceOf(treasury),
      suiUsdPrice(),
    ]);
    return { prizePoolSui, treasurySui, suiUsd, updatedAt: Date.now() };
  },
);
