import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_SUI_CHAIN,
  DEFAULT_TREASURY_ADDRESS,
  MIST_PER_SUI,
  PRIZE_POOL_ADDRESS,
  SUI_GRAPHQL,
} from "./ourblast.config";

const SUI_TYPE =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

function graphqlEndpoint(): string {
  return SUI_GRAPHQL[DEFAULT_SUI_CHAIN]!;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(graphqlEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

type RawBalance = { coinType: string; raw: number };

/** Every coin balance held by an address (raw units). */
async function rawBalances(address: string): Promise<RawBalance[]> {
  const data = await gql<{
    address?: {
      balances?: {
        nodes?: { coinType?: { repr?: string } | null; totalBalance?: string }[];
      };
    };
  }>(
    "query Balances($address: SuiAddress!) { address(address: $address) { balances(first: 50) { nodes { coinType { repr } totalBalance } } } }",
    { address },
  );
  const nodes = data?.address?.balances?.nodes ?? [];
  return nodes
    .map((n) => ({ coinType: n.coinType?.repr ?? "", raw: Number(n.totalBalance ?? 0) }))
    .filter((b) => b.coinType && b.raw > 0);
}

type Meta = { symbol: string; decimals: number; iconUrl: string };

/** Coin metadata (symbol + decimals + icon) for a set of coin types. */
async function coinMetadata(coinTypes: string[]): Promise<Record<string, Meta>> {
  const out: Record<string, Meta> = {};
  if (!coinTypes.length) return out;
  const fields = coinTypes
    .map((_, i) => `c${i}: coinMetadata(coinType: $t${i}) { symbol decimals iconUrl }`)
    .join("\n");
  const args = coinTypes.map((_, i) => `$t${i}: String!`).join(", ");
  const variables: Record<string, unknown> = {};
  coinTypes.forEach((t, i) => (variables[`t${i}`] = t));
  const data = await gql<
    Record<string, { symbol?: string; decimals?: number; iconUrl?: string } | null>
  >(`query Meta(${args}) { ${fields} }`, variables);
  coinTypes.forEach((t, i) => {
    const m = data?.[`c${i}`];
    out[t] = {
      symbol: m?.symbol || t.split("::").pop() || "TOKEN",
      decimals: typeof m?.decimals === "number" ? m.decimals : 9,
      iconUrl: m?.iconUrl ?? "",
    };
  });
  return out;
}

/** USD prices + DEX logos per coin type, from the deepest DEX pair on Sui. */
async function tokenPrices(
  coinTypes: string[],
): Promise<{ prices: Record<string, number>; icons: Record<string, string> }> {
  const out: Record<string, number> = {};
  const icons: Record<string, string> = {};
  if (!coinTypes.length) return { prices: out, icons };
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${coinTypes.slice(0, 30).join(",")}`,
      { headers: { accept: "application/json" } },
    );
    const json = (await res.json()) as {
      pairs?: {
        chainId?: string;
        baseToken?: { address?: string };
        priceUsd?: string;
        liquidity?: { usd?: number };
      }[];
    };
    const best: Record<string, number> = {};
    for (const p of json.pairs ?? []) {
      if (p.chainId !== "sui") continue;
      const addr = p.baseToken?.address ?? "";
      const price = Number(p.priceUsd ?? 0);
      const liq = Number(p.liquidity?.usd ?? 0);
      if (!addr || !price) continue;
      if (!(addr in best) || liq > best[addr]!) {
        best[addr] = liq;
        out[addr] = price;
      }
    }
  } catch {
    /* prices stay empty */
  }
  return out;
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

export type Holding = {
  coinType: string;
  symbol: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
};

export type VaultSizes = {
  prizePoolSui: number;
  treasurySui: number;
  suiUsd: number;
  /** Total USD value of every token held, per vault. */
  prizePoolUsd: number;
  treasuryUsd: number;
  prizePoolHoldings: Holding[];
  treasuryHoldings: Holding[];
  updatedAt: number;
};

/** Public read: live on-chain contents of the prize pool and community treasury. */
export const getVaultSizes = createServerFn({ method: "GET" }).handler(
  async (): Promise<VaultSizes> => {
    const treasury = (
      process.env['OURBLAST_TREASURY_ADDRESS'] ?? DEFAULT_TREASURY_ADDRESS
    ).toLowerCase();

    const [poolRaw, treasuryRaw, suiUsd] = await Promise.all([
      rawBalances(PRIZE_POOL_ADDRESS),
      rawBalances(treasury),
      suiUsdPrice(),
    ]);

    const types = Array.from(
      new Set([...poolRaw, ...treasuryRaw].map((b) => b.coinType)),
    );
    const nonSui = types.filter((t) => t !== SUI_TYPE);
    const [meta, prices] = await Promise.all([coinMetadata(nonSui), tokenPrices(nonSui)]);

    const toHoldings = (raws: RawBalance[]): Holding[] =>
      raws
        .map((b) => {
          const isSui = b.coinType === SUI_TYPE;
          const m = isSui ? { symbol: "SUI", decimals: 9 } : meta[b.coinType];
          const decimals = m?.decimals ?? 9;
          const amount = b.raw / 10 ** decimals;
          const priceUsd = isSui ? suiUsd : (prices[b.coinType] ?? 0);
          return {
            coinType: b.coinType,
            symbol: m?.symbol ?? "TOKEN",
            amount,
            priceUsd,
            valueUsd: amount * priceUsd,
          };
        })
        .filter((h) => h.amount > 0)
        .sort((a, b) => b.valueUsd - a.valueUsd);

    const prizePoolHoldings = toHoldings(poolRaw);
    const treasuryHoldings = toHoldings(treasuryRaw);
    const sum = (h: Holding[]) => h.reduce((t, x) => t + x.valueUsd, 0);
    const suiAmount = (h: Holding[]) =>
      h.find((x) => x.coinType === SUI_TYPE)?.amount ?? 0;

    return {
      prizePoolSui: suiAmount(prizePoolHoldings),
      treasurySui: suiAmount(treasuryHoldings),
      suiUsd,
      prizePoolUsd: sum(prizePoolHoldings),
      treasuryUsd: sum(treasuryHoldings),
      prizePoolHoldings,
      treasuryHoldings,
      updatedAt: Date.now(),
    };
  },
);

export { MIST_PER_SUI };
