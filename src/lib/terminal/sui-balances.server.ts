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

export interface SuiNft {
  id: string; type: string; name: string; image: string | null; description: string | null; collection: string;
  /** Set when the NFT sits inside a Sui Kiosk the wallet owns. */
  kiosk?: { kioskId: string; capId: string; locked: boolean };
}

function toNft(id: string, type: string, output: Record<string, unknown> | null | undefined): SuiNft | null {
  const d = (output ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  const image = ipfs(s("image_url") ?? s("img_url") ?? s("image") ?? s("thumbnail_url") ?? s("media_url"));
  if (!image && !s("name")) return null;
  const struct = type.split("<")[0]!.split("::").at(-1) ?? type;
  return { id, type, name: s("name") ?? struct, image, description: s("description"), collection: s("collection_name") ?? s("project_name") ?? struct };
}

interface KioskFields {
  object: { dynamicFields: {
    nodes: { name: { type: { repr: string }; json: { id?: string } | null }; value: { address?: string; contents?: { type: { repr: string }; display: { output: Record<string, unknown> | null } | null } } | null }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } } | null;
}

/** NFTs inside a kiosk (owner cap held by the wallet). Lock markers flag non-takeable items. */
async function readKioskNfts(kioskId: string, capId: string): Promise<SuiNft[]> {
  const items: SuiNft[] = [];
  const locked = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 10; page++) {
    const data: KioskFields = await gql<KioskFields>(
      `query($k:SuiAddress!,$after:String){object(address:$k){dynamicFields(first:50,after:$after){nodes{name{type{repr} json} value{... on MoveObject{address contents{type{repr} display{output}}}}} pageInfo{hasNextPage endCursor}}}}`,
      { k: kioskId, after },
    );
    const conn = data.object?.dynamicFields;
    if (!conn) break;
    for (const n of conn.nodes) {
      const kind = n.name.type.repr;
      if (/::kiosk::Lock$/.test(kind) && n.name.json?.id) locked.add(n.name.json.id.toLowerCase());
      if (/::kiosk::Item$/.test(kind) && n.value?.address && n.value.contents) {
        const nft = toNft(n.value.address, n.value.contents.type.repr, n.value.contents.display?.output);
        if (nft) items.push(nft);
      }
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return items.map((n) => ({ ...n, kiosk: { kioskId, capId, locked: locked.has(n.id.toLowerCase()) } }));
}

/** Shared TransferPolicy objects for an NFT type (rules listed by type name). */
export async function readTransferPolicies(type: string): Promise<{ id: string; rules: string[] }[]> {
  const data = await gql<{ objects: { nodes: { address: string; asMoveObject: { contents: { json: { rules?: { contents?: string[] } } } } | null }[] } }>(
    `query($t:String!){objects(first:10,filter:{type:$t}){nodes{address asMoveObject{contents{json}}}}}`,
    { t: `0x2::transfer_policy::TransferPolicy<${type}>` },
  );
  return data.objects.nodes.map((n) => ({ id: n.address, rules: n.asMoveObject?.contents.json.rules?.contents ?? [] }));
}

interface ObjPage {
  address: { objects: {
    nodes: { address: string; contents: { type: { repr: string }; json: unknown; display: { output: Record<string, unknown> | null } | null } | null }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } } | null;
}

// ipfs.io's public gateway was sunset (returns 429); filebase serves CIDs reliably.
function ipfs(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return `https://ipfs.filebase.io/ipfs/${url.slice(7).replace(/^ipfs\//, "")}`;
  const m = url.match(/^https?:\/\/(?:gateway\.)?ipfs\.io\/ipfs\/(.+)$/);
  if (m) return `https://ipfs.filebase.io/ipfs/${m[1]}`;
  return /^https?:\/\//.test(url) ? url : null;
}

/** Read-only list of NFTs the wallet owns directly or inside its kiosks, up to `max`. */
export async function readSuiNfts(address: string, max = 200): Promise<SuiNft[]> {
  const out: SuiNft[] = [];
  const caps: { capId: string; kioskId: string }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 10 && out.length < max; page++) {
    const data: ObjPage = await gql<ObjPage>(
      `query($a:SuiAddress!,$after:String){address(address:$a){objects(first:50,after:$after){nodes{address contents{type{repr} json display{output}}} pageInfo{hasNextPage endCursor}}}}`,
      { a: address, after },
    );
    const conn = data.address?.objects;
    if (!conn) break;
    for (const n of conn.nodes) {
      const type = n.contents?.type.repr ?? "";
      if (!type || /::coin::Coin</.test(type)) continue;
      if (/^0x0*2::kiosk::KioskOwnerCap$/.test(type)) {
        const forId = (n.contents?.json as { for?: string } | null)?.for;
        if (forId) caps.push({ capId: n.address, kioskId: forId });
        continue;
      }
      const nft = toNft(n.address, type, n.contents?.display?.output);
      if (nft) out.push(nft);
    }
    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  for (const c of caps.slice(0, 10)) out.push(...(await readKioskNfts(c.kioskId, c.capId)));
  return out.slice(0, max);
}

/** Upgraded id a package links against for `originalId` (falls back to the original). */
export async function readLinkedPackage(typePkg: string, originalId: string): Promise<string> {
  const data = await gql<{ package: { linkage: { originalId: string; upgradedId: string }[] } | null }>(
    `query($p:SuiAddress!){package(address:$p){linkage{originalId upgradedId}}}`, { p: typePkg },
  );
  const strip = (s: string) => s.toLowerCase().replace(/^0x0*/, "");
  return data.package?.linkage.find((l) => strip(l.originalId) === strip(originalId))?.upgradedId ?? originalId;
}
