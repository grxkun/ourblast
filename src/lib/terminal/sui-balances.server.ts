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
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://graphql.mainnet.sui.io/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("Sui data is temporarily unavailable. Please refresh.");
  const json = await res.json() as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length || !json.data) throw new Error("Sui data is temporarily unavailable. Please refresh.");
  return json.data;
}

/** Coin symbol/decimals from official GraphQL (JSON-RPC metadata is retired on public nodes). Null = unknown coin. */
export async function readCoinMetadata(coinType: string): Promise<{ symbol: string; decimals: number } | null> {
  const { mainTokenByType } = await import("./mainTokens");
  const known = mainTokenByType(coinType);
  if (known) return { symbol: known.symbol, decimals: known.decimals };
  if (normalizeStructTag(coinType) === normalizeStructTag("0x2::sui::SUI")) return { symbol: "SUI", decimals: 9 };
  const data = await gql<{ coinMetadata: { symbol: string; decimals: number } | null }>(
    `query($t:String!){coinMetadata(coinType:$t){symbol decimals}}`, { t: coinType },
  );
  return data.coinMetadata;
}

/**
 * Funds sitting in the address accumulator (received via balance::send_funds).
 * These have no Coin object yet, so suix_getCoins cannot see them.
 */
export async function readAddressBalance(address: string, coinType: string): Promise<bigint> {
  const data = await gql<{ address: { balance: { addressBalance: string | null } | null } | null }>(
    `query($a:SuiAddress!,$t:String!){address(address:$a){balance(coinType:$t){addressBalance}}}`,
    { a: address, t: coinType },
  );
  return BigInt(data.address?.balance?.addressBalance ?? "0");
}

export interface SuiNft { id: string; type: string; name: string; image: string | null; description: string | null; collection: string }

interface ObjPage {
  address: { objects: {
    nodes: { address: string; contents: { type: { repr: string }; display: { output: Record<string, unknown> | null } | null } | null }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } } | null;
}

function ipfs(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  return /^https?:\/\//.test(url) ? url : null;
}

/** Read-only list of non-coin objects the wallet owns (NFTs), up to `max`. */
export async function readSuiNfts(address: string, max = 200): Promise<SuiNft[]> {
  const out: SuiNft[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10 && out.length < max; page++) {
    const data: ObjPage = await gql<ObjPage>(
      `query($a:SuiAddress!,$after:String){address(address:$a){objects(first:50,after:$after){nodes{address contents{type{repr} display{output}}} pageInfo{hasNextPage endCursor}}}}`,
      { a: address, after },
    );
    const conn = data.address?.objects;
    if (!conn) break;
    for (const n of conn.nodes) {
      const type = n.contents?.type.repr ?? "";
      if (!type || /^0x0*2::coin::Coin</.test(type) || /::coin::Coin</.test(type)) continue;
      const d = (n.contents?.display?.output ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
      const image = ipfs(s("image_url") ?? s("img_url") ?? s("image"));
      // Only things wallets would show as collectibles: has a Display name or image.
      if (!image && !s("name")) continue;
      const struct = type.split("<")[0]!.split("::").at(-1) ?? type;
      out.push({ id: n.address, type, name: s("name") ?? struct, image, description: s("description"), collection: s("collection_name") ?? s("project_name") ?? struct });
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out.slice(0, max);
}
