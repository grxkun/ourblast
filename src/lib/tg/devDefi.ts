// SPDX-License-Identifier: BUSL-1.1
/** Suilend obligation USD values are 18-decimal fixed point; net = deposits − borrows (never negative). */
export const SUILEND_CAP_TYPE = "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::lending_market::ObligationOwnerCap";
type Ob = { deposited_value_usd?: { value?: string }; unweighted_borrowed_value_usd?: { value?: string } };
const usd = (s?: string) => (s ? Number(BigInt(s) / 10n ** 12n) / 1e6 : 0);
export function suilendNetUsd(obligations: (Ob | null | undefined)[]): number | null {
  const valid = obligations.filter((o): o is Ob => !!o);
  if (!valid.length) return null;
  return valid.reduce((sum, o) => sum + Math.max(0, usd(o.deposited_value_usd?.value) - usd(o.unweighted_borrowed_value_usd?.value)), 0);
}
