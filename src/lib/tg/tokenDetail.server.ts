// SPDX-License-Identifier: BUSL-1.1
import { canonicalCoin } from "./market";
import { readCurve } from "./curvePrice.server";
import { readCoinMetadata } from "@/lib/terminal/sui-balances.server";

const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const pending = new Map<string, ReturnType<typeof fetchDetail>>();
const cache = new Map<string, { at: number; data: Awaited<ReturnType<typeof fetchDetail>> }>();

async function fetchDetail(coinType: string) {
  const [meta, prices] = await Promise.all([
    readCoinMetadata(coinType).catch(() => null),
    fetch("https://aftermath.finance/api/price-info", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ coins: [SUI, coinType] }), signal: AbortSignal.timeout(5000),
    }).then(async (r) => r.ok ? await r.json() as Record<string, { price?: number }> : {}).catch(() => ({} as Record<string, { price?: number }>)),
  ]);
  const curve = meta ? await readCurve(coinType, meta.decimals).catch(() => null) : null;
  const suiUsd = Object.entries(prices).find(([key]) => canonicalCoin(key) === SUI)?.[1].price;
  const dexPrice = Object.entries(prices).find(([key]) => canonicalCoin(key) === coinType)?.[1].price;
  const candidate = curve?.live ? curve.priceUsd ?? (curve.priceSui != null && suiUsd ? curve.priceSui * suiUsd : null) : dexPrice;
  const priceUsd = candidate != null && Number.isFinite(candidate) && candidate > 0 ? candidate : null;
  return { coinType, symbol: meta?.symbol ?? null, priceUsd, curve,
    fdvUsd: priceUsd != null && curve?.totalSupply ? priceUsd * curve.totalSupply : null,
    source: curve?.live ? curve.factory : priceUsd != null ? "Aftermath" : null,
    observedAt: Date.now(),
  };
}

/** Public, exact-contract read only. Short cache + single-flight prevents duplicate chart reads. */
export async function loadTokenDetail(type: string) {
  const coinType = canonicalCoin(type);
  if (!coinType) throw new Error("Invalid token contract");
  const hit = cache.get(coinType);
  if (hit && Date.now() - hit.at < 8000) return hit.data;
  const active = pending.get(coinType);
  if (active) return active;
  const job = fetchDetail(coinType);
  pending.set(coinType, job);
  try {
    const data = await job;
    if (cache.size >= 500) cache.clear();
    cache.set(coinType, { at: Date.now(), data });
    return data;
  } finally { pending.delete(coinType); }
}