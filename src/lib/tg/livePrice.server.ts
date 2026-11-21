// SPDX-License-Identifier: BUSL-1.1
/** Shared USD feed: active curve spot takes precedence; missing data never becomes zero. */
export async function livePrices(coinTypes: string[]): Promise<Record<string, number>> {
  const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
  const { aftermathPrices } = await import("./runCommand.server");
  const prices = await aftermathPrices([...new Set([SUI, ...coinTypes])]).catch(() => ({} as Record<string, number>));
  const [{ readCoinMetadata }, { readCurve }] = await Promise.all([
    import("@/lib/terminal/sui-balances.server"), import("./curvePrice.server"),
  ]);
  await Promise.all([...new Set(coinTypes)].filter((ct) => !/^0x0*2::sui::SUI$/.test(ct)).map(async (ct) => {
    const meta = await readCoinMetadata(ct).catch(() => null);
    if (!meta) return;
    const curve = await readCurve(ct, meta.decimals).catch(() => null);
    const usd = curve?.live ? curve.priceUsd ?? (curve.priceSui != null && prices[SUI] ? curve.priceSui * prices[SUI] : null) : null;
    if (usd != null && Number.isFinite(usd) && usd > 0) prices[ct] = usd;
    else if (!(Number.isFinite(prices[ct]) && Number(prices[ct]) > 0)) delete prices[ct];
  }));
  return prices;
}