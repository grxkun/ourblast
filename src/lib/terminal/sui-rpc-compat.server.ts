// SPDX-License-Identifier: BUSL-1.1
/**
 * Legacy Sui JSON-RPC calls answered by Sui's official GraphQL service.
 *
 * Every public JSON-RPC mirror was shut down in October 2026, so the shared
 * `rpc()` helper routes each method it still receives through GraphQL and
 * returns the same shape JSON-RPC used to, letting existing callers keep
 * working unchanged. Unsupported methods throw instead of guessing.
 */

const GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
const TIMEOUT_MS = 30_000;

export async function suiGql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "ourblast/1.0" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sui read failed (HTTP ${res.status}).`);
  }
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  if (!json.data) throw new Error("Sui read failed.");
  return json.data;
}

/** "0x000…02::sui::SUI" → "0x2::sui::SUI", like JSON-RPC printed framework types. */
export function shortType(type: string): string {
  return type.replace(/0x0{58,}([0-9a-f]{1,6})(?![0-9a-f])/g, "0x$1");
}

/**
 * GraphQL returns Move values flat; JSON-RPC wrapped every nested struct as
 * `{ type, fields }` and every UID as `{ id }`. Each nested object keeps its
 * flat keys and also gets a `fields` alias so both reading styles work.
 */
export function toRpcFields(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => toRpcFields(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toRpcFields(v, k);
    return { ...out, fields: out };
  }
  if (key === "id" && typeof value === "string" && value.startsWith("0x")) return { id: value };
  return value;
}

function topFields(json: unknown): Record<string, unknown> {
  const wrapped = toRpcFields(json) as Record<string, unknown> | undefined;
  if (!wrapped || typeof wrapped !== "object") return {};
  const { fields: _drop, ...flat } = wrapped;
  return flat;
}

type GqlOwner =
  | { __typename: "AddressOwner"; address?: { address: string } }
  | { __typename: "ObjectOwner"; address?: { address: string } }
  | { __typename: "Shared"; initialSharedVersion?: number }
  | { __typename: "Immutable" }
  | { __typename: string }
  | null;

function rpcOwner(owner: GqlOwner): unknown {
  if (!owner) return undefined;
  if (owner.__typename === "AddressOwner") return { AddressOwner: (owner as { address?: { address: string } }).address?.address };
  if (owner.__typename === "ObjectOwner") return { ObjectOwner: (owner as { address?: { address: string } }).address?.address };
  if (owner.__typename === "Shared") {
    return { Shared: { initial_shared_version: Number((owner as { initialSharedVersion?: number }).initialSharedVersion) } };
  }
  if (owner.__typename === "Immutable") return "Immutable";
  return undefined;
}

const OWNER = `owner{__typename ... on AddressOwner{address{address}} ... on ObjectOwner{address{address}} ... on Shared{initialSharedVersion}}`;

async function getObject(params: unknown[]) {
  const [id] = params as [string];
  const data = await suiGql<{
    object: {
      address: string;
      version: number;
      digest: string;
      owner: GqlOwner;
      asMoveObject: { contents: { type: { repr: string }; json: unknown } | null } | null;
      asMovePackage: { modules: { nodes: { name: string; bytes: string }[] } } | null;
    } | null;
  }>(
    `query($id:SuiAddress!){object(address:$id){address version digest ${OWNER} asMoveObject{contents{type{repr} json}} asMovePackage{modules(first:50){nodes{name bytes}}}}}`,
    { id },
  );
  const o = data.object;
  if (!o) return { error: { code: "notExists", object_id: id } };
  const type = o.asMovePackage ? "package" : shortType(o.asMoveObject?.contents?.type.repr ?? "");
  const moduleMap = o.asMovePackage
    ? Object.fromEntries(o.asMovePackage.modules.nodes.map((m) => [m.name, m.bytes]))
    : undefined;
  return {
    data: {
      objectId: o.address,
      version: String(o.version),
      digest: o.digest,
      type,
      owner: rpcOwner(o.owner),
      content: o.asMoveObject?.contents
        ? { dataType: "moveObject", type, hasPublicTransfer: true, fields: topFields(o.asMoveObject.contents.json) }
        : o.asMovePackage
          ? { dataType: "package" }
          : undefined,
      bcs: moduleMap ? { dataType: "package", moduleMap } : undefined,
    },
  };
}

async function getCoins(params: unknown[]) {
  const [owner, coinType = "0x2::sui::SUI", cursor = null, limit = 50] = params as [string, string?, string | null?, number?];
  const data = await suiGql<{
    address: {
      objects: {
        nodes: { address: string; version: number; digest: string; contents: { json: { balance?: string } } | null }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  }>(
    `query($a:SuiAddress!,$t:String!,$n:Int,$c:String){address(address:$a){objects(first:$n,after:$c,filter:{type:$t}){nodes{address version digest contents{json}} pageInfo{hasNextPage endCursor}}}}`,
    { a: owner, t: `0x2::coin::Coin<${coinType}>`, n: Math.min(Number(limit) || 50, 50), c: cursor },
  );
  const page = data.address?.objects;
  return {
    data: (page?.nodes ?? []).map((n) => ({
      coinType,
      coinObjectId: n.address,
      version: String(n.version),
      digest: n.digest,
      balance: String(n.contents?.json?.balance ?? "0"),
    })),
    nextCursor: page?.pageInfo.endCursor ?? null,
    hasNextPage: page?.pageInfo.hasNextPage ?? false,
  };
}

async function getBalance(params: unknown[]) {
  const [owner, coinType = "0x2::sui::SUI"] = params as [string, string?];
  const data = await suiGql<{ address: { balance: { totalBalance: string | null } | null } | null }>(
    `query($a:SuiAddress!,$t:String!){address(address:$a){balance(coinType:$t){totalBalance}}}`,
    { a: owner, t: coinType },
  );
  return { coinType, coinObjectCount: 0, totalBalance: String(data.address?.balance?.totalBalance ?? "0"), lockedBalance: {} };
}

async function getOwnedObjects(params: unknown[]) {
  const [owner, query = {}, cursor = null, limit = 50] = params as [
    string,
    { filter?: { StructType?: string }; options?: { showContent?: boolean } }?,
    string | null?,
    number?,
  ];
  const data = await suiGql<{
    address: {
      objects: {
        nodes: { address: string; version: number; digest: string; contents: { type: { repr: string }; json: unknown } | null }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  }>(
    `query($a:SuiAddress!,$t:String,$n:Int,$c:String){address(address:$a){objects(first:$n,after:$c,filter:{type:$t}){nodes{address version digest contents{type{repr} json}} pageInfo{hasNextPage endCursor}}}}`,
    { a: owner, t: query.filter?.StructType ?? null, n: Math.min(Number(limit) || 50, 50), c: cursor },
  );
  const page = data.address?.objects;
  return {
    data: (page?.nodes ?? []).map((n) => {
      const type = shortType(n.contents?.type.repr ?? "");
      return {
        data: {
          objectId: n.address,
          version: String(n.version),
          digest: n.digest,
          type,
          content: n.contents ? { dataType: "moveObject", type, fields: topFields(n.contents.json) } : undefined,
        },
      };
    }),
    nextCursor: page?.pageInfo.endCursor ?? null,
    hasNextPage: page?.pageInfo.hasNextPage ?? false,
  };
}

const TX_FIELDS = `digest sender{address} effects{status timestamp executionError{message}
  objectChanges(first:50){nodes{address idCreated idDeleted outputState{version digest ${OWNER} asMoveObject{contents{type{repr}}}}}}
  balanceChanges(first:50){nodes{owner{address} coinType{repr} amount}}
  events(first:50){nodes{contents{type{repr} json} sender{address}}}}`;

interface GqlTx {
  digest: string;
  sender: { address: string } | null;
  effects: {
    status: string;
    timestamp: string | null;
    executionError: { message: string } | null;
    objectChanges: {
      nodes: {
        address: string;
        idCreated: boolean;
        idDeleted: boolean;
        outputState: { version: number; digest: string; owner: GqlOwner; asMoveObject: { contents: { type: { repr: string } } | null } | null } | null;
      }[];
    } | null;
    balanceChanges: { nodes: { owner: { address: string } | null; coinType: { repr: string }; amount: string }[] } | null;
    events: { nodes: { contents: { type: { repr: string }; json: unknown }; sender: { address: string } | null }[] } | null;
  } | null;
}

function rpcTx(t: GqlTx) {
  const e = t.effects;
  const ok = e?.status === "SUCCESS";
  return {
    digest: t.digest,
    timestampMs: e?.timestamp ? String(Date.parse(e.timestamp)) : undefined,
    transaction: { data: { sender: t.sender?.address, transaction: { inputs: undefined } } },
    effects: e
      ? { status: ok ? { status: "success" } : { status: "failure", error: e.executionError?.message ?? "Transaction failed." } }
      : undefined,
    objectChanges: (e?.objectChanges?.nodes ?? []).map((n) => ({
      type: n.idCreated ? "created" : n.idDeleted ? "deleted" : "mutated",
      objectId: n.address,
      version: n.outputState ? String(n.outputState.version) : undefined,
      digest: n.outputState?.digest,
      owner: n.outputState ? rpcOwner(n.outputState.owner) : undefined,
      objectType: n.outputState?.asMoveObject?.contents ? shortType(n.outputState.asMoveObject.contents.type.repr) : undefined,
    })),
    balanceChanges: (e?.balanceChanges?.nodes ?? []).map((b) => ({
      owner: { AddressOwner: b.owner?.address },
      coinType: shortType(b.coinType.repr),
      amount: b.amount,
    })),
    events: (e?.events?.nodes ?? []).map((ev) => ({
      type: shortType(ev.contents.type.repr),
      parsedJson: ev.contents.json,
      sender: ev.sender?.address,
    })),
  };
}

async function getTransactionBlock(params: unknown[]) {
  const [digest] = params as [string];
  const data = await suiGql<{ transaction: GqlTx | null }>(`query($d:String!){transaction(digest:$d){${TX_FIELDS}}}`, { d: digest });
  // JSON-RPC errored on unknown digests; callers rely on that to keep polling.
  if (!data.transaction?.effects) throw new Error(`Could not find the referenced transaction ${digest}.`);
  return rpcTx(data.transaction);
}

async function executeTransactionBlock(params: unknown[]) {
  const [tx, signatures] = params as [string, string[]];
  const data = await suiGql<{ executeTransaction: { effects: { transaction: GqlTx | null } | null } | null }>(
    `mutation($tx:String!,$s:[String!]!){executeTransaction(transactionDataBcs:$tx,signatures:$s){effects{transaction{${TX_FIELDS}}}}}`,
    { tx, s: signatures },
  );
  const t = data.executeTransaction?.effects?.transaction;
  if (!t) throw new Error("The network did not return the transaction result.");
  return rpcTx(t);
}

async function queryTransactionBlocks(params: unknown[]) {
  const [query, , limit = 1] = params as [{ filter?: { FromAddress?: string } }, unknown, number?];
  const from = query?.filter?.FromAddress;
  if (!from) throw new Error("Only sender-filtered transaction lookups are supported.");
  const data = await suiGql<{ transactions: { nodes: { digest: string; effects: { timestamp: string | null } | null }[] } }>(
    `query($a:SuiAddress!,$n:Int){transactions(last:$n,filter:{sentAddress:$a}){nodes{digest effects{timestamp}}}}`,
    { a: from, n: Math.min(Number(limit) || 1, 50) },
  );
  return {
    data: data.transactions.nodes
      .slice()
      .reverse()
      .map((n) => ({ digest: n.digest, timestampMs: n.effects?.timestamp ? String(Date.parse(n.effects.timestamp)) : undefined })),
    hasNextPage: false,
    nextCursor: null,
  };
}

async function queryEvents(params: unknown[]) {
  const [query, cursor = null, limit = 50, descending = false] = params as [{ MoveEventType?: string }, string | null?, number?, boolean?];
  if (!query?.MoveEventType) throw new Error("Only event-type lookups are supported.");
  const n = Math.min(Number(limit) || 50, 50);
  const q = descending
    ? `query($t:String!,$n:Int,$c:String){events(last:$n,before:$c,filter:{type:$t}){nodes{contents{type{repr} json} sender{address}} pageInfo{hasPreviousPage startCursor}}}`
    : `query($t:String!,$n:Int,$c:String){events(first:$n,after:$c,filter:{type:$t}){nodes{contents{type{repr} json} sender{address}} pageInfo{hasNextPage endCursor}}}`;
  const data = await suiGql<{
    events: {
      nodes: { contents: { type: { repr: string }; json: unknown }; sender: { address: string } | null }[];
      pageInfo: { hasNextPage?: boolean; endCursor?: string | null; hasPreviousPage?: boolean; startCursor?: string | null };
    };
  }>(q, { t: query.MoveEventType, n, c: cursor });
  const nodes = descending ? data.events.nodes.slice().reverse() : data.events.nodes;
  return {
    data: nodes.map((ev) => ({ type: shortType(ev.contents.type.repr), parsedJson: ev.contents.json, sender: ev.sender?.address })),
    hasNextPage: Boolean(descending ? data.events.pageInfo.hasPreviousPage : data.events.pageInfo.hasNextPage),
    nextCursor: (descending ? data.events.pageInfo.startCursor : data.events.pageInfo.endCursor) ?? null,
  };
}

async function getDynamicFields(params: unknown[]) {
  const [parent, cursor = null, limit = 50] = params as [string, string | null?, number?];
  const data = await suiGql<{
    object: {
      dynamicFields: {
        nodes: { address: string; name: { type: { repr: string }; json: unknown } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  }>(
    `query($p:SuiAddress!,$n:Int,$c:String){object(address:$p){dynamicFields(first:$n,after:$c){nodes{address name{type{repr} json}} pageInfo{hasNextPage endCursor}}}}`,
    { p: parent, n: Math.min(Number(limit) || 50, 50), c: cursor },
  );
  const page = data.object?.dynamicFields;
  return {
    data: (page?.nodes ?? []).map((f) => ({
      name: { type: shortType(f.name.type.repr), value: f.name.json },
      objectId: f.address,
    })),
    nextCursor: page?.pageInfo.endCursor ?? null,
    hasNextPage: page?.pageInfo.hasNextPage ?? false,
  };
}

async function resolveName(params: unknown[]) {
  const [name] = params as [string];
  const data = await suiGql<{ address: { address: string } | null }>(`query($n:String!){address(name:$n){address}}`, { n: name });
  return data.address?.address ?? null;
}

async function referenceGasPrice() {
  const data = await suiGql<{ epoch: { referenceGasPrice: string } | null }>(`query{epoch{referenceGasPrice}}`);
  return String(data.epoch?.referenceGasPrice ?? "1000");
}

const METHODS: Record<string, (params: unknown[]) => Promise<unknown>> = {
  sui_getObject: getObject,
  sui_getTransactionBlock: getTransactionBlock,
  sui_executeTransactionBlock: executeTransactionBlock,
  suix_getCoins: getCoins,
  suix_getBalance: getBalance,
  suix_getOwnedObjects: getOwnedObjects,
  suix_getDynamicFields: getDynamicFields,
  suix_queryEvents: queryEvents,
  suix_queryTransactionBlocks: queryTransactionBlocks,
  suix_resolveNameServiceAddress: resolveName,
  suix_getReferenceGasPrice: referenceGasPrice,
};

export async function suiCompatCall<T>(method: string, params: unknown[]): Promise<T> {
  const handler = METHODS[method];
  if (!handler) throw new Error(`Sui method ${method} is not supported since JSON-RPC was retired.`);
  return (await handler(params)) as T;
}
