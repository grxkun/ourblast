import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_SUI_CHAIN,
  DEFAULT_TREASURY_ADDRESS,
  MIST_PER_SUI,
  PRIZE_POOL_ADDRESS,
  SUI_GRAPHQL,
} from "./ourblast.config";

function graphqlEndpoint(): string {
  return SUI_GRAPHQL[DEFAULT_SUI_CHAIN]!;
}

/** SUI balance (in whole SUI) held by an address, via the Sui GraphQL service. */
async function balanceOf(address: string): Promise<number> {
  try {
    const res = await fetch(graphqlEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query:
          "query Balance($address: SuiAddress!) { address(address: $address) { balances(first: 50) { nodes { coinType { repr } totalBalance } } } }",
        variables: { address },
      }),
    });
    const json = (await res.json()) as {
      data?: {
        address?: {
          balances?: {
            nodes?: { coinType?: { repr?: string } | null; totalBalance?: string }[];
          };
        };
      };
    };
    const nodes = json.data?.address?.balances?.nodes ?? [];
    // SUI coin type repr ends with "::sui::SUI" (zero-padded package in mainnet).
    const suiNode = nodes.find((n) => (n.coinType?.repr ?? "").endsWith("::sui::SUI"));
    return Number(suiNode?.totalBalance ?? 0) / MIST_PER_SUI;
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
