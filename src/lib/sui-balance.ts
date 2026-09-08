import { DEFAULT_SUI_CHAIN, MIST_PER_SUI, SUI_FULLNODES } from "./ourblast.config";

/** Reads the SUI coin balance of an address from a public fullnode. */
export async function fetchSuiBalance(address: string): Promise<number> {
  const url = SUI_FULLNODES[DEFAULT_SUI_CHAIN]!;
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
  const mist = Number(json.result?.totalBalance ?? 0);
  return mist / MIST_PER_SUI;
}

export function formatSui(amount: number): string {
  if (amount === 0) return "0";
  if (amount < 0.001) return "<0.001";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount < 1 ? 4 : 2 });
}
