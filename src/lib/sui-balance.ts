import { MIST_PER_SUI } from "./ourblast.config";

/**
 * Reads the SUI balance of an address. Public JSON-RPC fullnodes were retired,
 * so this goes through the Sui GraphQL service.
 */
export async function fetchSuiBalance(address: string): Promise<number> {
  const res = await fetch("https://graphql.mainnet.sui.io/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query($a:SuiAddress!){address(address:$a){balance(coinType:"0x2::sui::SUI"){totalBalance}}}`,
      variables: { a: address },
    }),
  });
  const json = (await res.json()) as {
    data?: { address?: { balance?: { totalBalance?: string } | null } | null };
  };
  const mist = Number(json.data?.address?.balance?.totalBalance ?? 0);
  return Number.isFinite(mist) ? mist / MIST_PER_SUI : 0;
}

export function formatSui(amount: number): string {
  if (amount === 0) return "0";
  if (amount < 0.001) return "<0.001";
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount < 1 ? 4 : 2 });
}
