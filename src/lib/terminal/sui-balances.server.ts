// SPDX-License-Identifier: BUSL-1.1
import { normalizeStructTag } from "@mysten/sui/utils";

interface BalancePage {
  address: {
    balances: {
      nodes: { coinType: { repr: string }; totalBalance: string; coinMetadata: { symbol: string; decimals: number } | null }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

/** Read-only, paginated holdings; a provider failure must never mean an empty wallet. */
export async function readSuiHoldings(address: string) {
  const holdings: { coinType: string; balance: bigint; symbol: string | null; decimals: number | null }[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const res = await fetch("https://graphql.mainnet.sui.io/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($a:SuiAddress!,$after:String){address(address:$a){balances(first:50,after:$after){nodes{coinType{repr} totalBalance coinMetadata{symbol decimals}} pageInfo{hasNextPage endCursor}}}}`,
        variables: { a: address, after: cursor },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error("Sui balances are temporarily unavailable. Please refresh.");
    const json = await res.json() as { data?: BalancePage; errors?: { message: string }[] };
    const page = json.data?.address?.balances;
    if (json.errors?.length || !page) throw new Error("Sui balances are temporarily unavailable. Please refresh.");
    for (const node of page.nodes) {
      const balance = BigInt(node.totalBalance);
      if (balance > 0n) holdings.push({
        coinType: normalizeStructTag(node.coinType.repr), balance,
        symbol: node.coinMetadata?.symbol ?? null, decimals: node.coinMetadata?.decimals ?? null,
      });
    }
    if (!page.pageInfo.hasNextPage) return holdings;
    const next = page.pageInfo.endCursor;
    if (!next || seen.has(next)) throw new Error("Sui balances could not be fully read. Please refresh.");
    seen.add(next);
    cursor = next;
  } while (cursor);
  return holdings;
}