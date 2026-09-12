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
  return SUI_GRAPHQL[DEFAULT_SUI_CHAIN] ?? "https://graphql.mainnet.sui.io/graphql";
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
        info?: { imageUrl?: string };
      }[];
    };
    const best: Record<string, number> = {};
    for (const p of json.pairs ?? []) {
      if (p.chainId !== "sui") continue;
      const addr = p.baseToken?.address ?? "";
      const price = Number(p.priceUsd ?? 0);
      const liq = Number(p.liquidity?.usd ?? 0);
      if (!addr || !price) continue;
      if (!(addr in best) || liq > (best[addr] ?? 0)) {
        best[addr] = liq;
        out[addr] = price;
        if (p.info?.imageUrl) icons[addr] = p.info.imageUrl;
      }
    }
  } catch {
    /* prices stay empty */
  }
  return { prices: out, icons };
}

/** Independent DEX price fallback for hosts that DexScreener rate-limits. */
async function geckoTerminalPrices(coinTypes: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (!coinTypes.length) return prices;
  try {
    const encoded = coinTypes.map(encodeURIComponent).join(",");
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/simple/networks/sui-network/token_price/${encoded}`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "OURBLAST/1.0",
        },
      },
    );
    if (!res.ok) return prices;
    const json = (await res.json()) as {
      data?: { attributes?: { token_prices?: Record<string, string | null> } };
    };
    for (const [coinType, value] of Object.entries(
      json.data?.attributes?.token_prices ?? {},
    )) {
      const price = Number(value ?? 0);
      if (Number.isFinite(price) && price > 0) prices[coinType] = price;
    }
  } catch {
    /* fallback prices stay empty */
  }
  return prices;
}

/** Prices for tokens still trading on SuiPump's bonding curve, quoted in SUI. */
async function suiPumpPrices(
  coinTypes: string[],
  suiUsd: number,
): Promise<{ prices: Record<string, number>; icons: Record<string, string> }> {
  const prices: Record<string, number> = {};
  const icons: Record<string, string> = {};
  if (!coinTypes.length || !suiUsd) return { prices, icons };

  try {
    const res = await fetch("https://suipump-main-web.onrender.com/tokens", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { prices, icons };
    const tokens = (await res.json()) as {
      tokenType?: string;
      iconUrl?: string;
      stats?: { live_price_sui?: number | null; last_price?: number | null };
    }[];
    const wanted = new Set(coinTypes);
    for (const token of tokens) {
      const coinType = token.tokenType ?? "";
      if (!wanted.has(coinType)) continue;
      const priceSui = Number(token.stats?.live_price_sui ?? token.stats?.last_price ?? 0);
      if (priceSui > 0) prices[coinType] = priceSui * suiUsd;
      if (token.iconUrl) icons[coinType] = token.iconUrl;
    }
  } catch {
    /* launchpad prices stay empty */
  }
  return { prices, icons };
}

async function suiUsdPrice(): Promise<number> {
  const sources: { url: string; read: (json: unknown) => number }[] = [
    {
      url: "https://api.coinpaprika.com/v1/tickers/sui-sui",
      read: (json) =>
        Number((json as { quotes?: { USD?: { price?: number } } }).quotes?.USD?.price ?? 0),
    },
    {
      url: "https://api.binance.com/api/v3/ticker/price?symbol=SUIUSDT",
      read: (json) => Number((json as { price?: string }).price ?? 0),
    },
    {
      url: "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
      read: (json) => Number((json as { sui?: { usd?: number } }).sui?.usd ?? 0),
    },
    {
      url: `https://api.dexscreener.com/latest/dex/tokens/${SUI_TYPE}`,
      read: (json) => {
        const pairs = (json as { pairs?: { priceUsd?: string; liquidity?: { usd?: number } }[] })
          .pairs ?? [];
        const deepest = pairs.reduce<(typeof pairs)[number] | null>((best, pair) => {
          const liquidity = Number(pair.liquidity?.usd ?? 0);
          const bestLiquidity = Number(best?.liquidity?.usd ?? 0);
          return liquidity > bestLiquidity ? pair : best;
        }, null);
        return Number(deepest?.priceUsd ?? 0);
      },
    },
  ];

  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const price = source.read(await res.json());
      if (Number.isFinite(price) && price > 0) return price;
    } catch {
      /* try the next independent price source */
    }
  }
  return 0;
}

export type Holding = {
  coinType: string;
  symbol: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  /** Token logo URL, empty when none is published. */
  iconUrl: string;
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
    const [meta, dex, gecko, suiPump] = await Promise.all([
      coinMetadata(types),
      tokenPrices(nonSui),
      geckoTerminalPrices(nonSui),
      suiPumpPrices(nonSui, suiUsd),
    ]);

    const toHoldings = (raws: RawBalance[]): Holding[] =>
      raws
        .map((b) => {
          const isSui = b.coinType === SUI_TYPE;
          const m = meta[b.coinType];
          const decimals = isSui ? 9 : (m?.decimals ?? 9);
          const amount = b.raw / 10 ** decimals;
          const priceUsd = isSui
            ? suiUsd
            : (dex.prices[b.coinType] ??
              gecko[b.coinType] ??
              suiPump.prices[b.coinType] ??
              0);
          return {
            coinType: b.coinType,
            symbol: isSui ? "SUI" : (m?.symbol ?? "TOKEN"),
            amount,
            priceUsd,
            valueUsd: amount * priceUsd,
            iconUrl: m?.iconUrl || dex.icons[b.coinType] || suiPump.icons[b.coinType] || "",
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
