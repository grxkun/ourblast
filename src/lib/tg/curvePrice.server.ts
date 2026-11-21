// SPDX-License-Identifier: BUSL-1.1
/** Live in-curve prices read straight from launchpad objects, for tokens with no DEX pool yet. */
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { b64Address, blastSpotSui, curveProgress } from "./curvePrice";

export interface CurveState {
  factory: string;
  priceSui: number | null;
  /** 0–1; 1 once graduated. */
  progress: number | null;
  live: boolean;
  creator: string | null;
  /** Total supply in whole tokens (FDV basis). */
  totalSupply: number | null;
}

const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const r = await fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(5000) });
  const j = (await r.json()) as { data?: T };
  return j.data ?? null;
}

async function blastCurve(coinType: string, decimals: number): Promise<CurveState | null> {
  const d = await gql<{ objects?: { nodes?: { asMoveObject?: { contents?: { json?: Record<string, any> } } }[] } }>(
    "query($t:String!){objects(first:1,filter:{type:$t}){nodes{asMoveObject{contents{json}}}}}",
    { t: `${BLAST_V2_LAUNCH_PKG}::launch::Launch<${coinType}, ${SUI}>` });
  const j = d?.objects?.nodes?.[0]?.asMoveObject?.contents?.json;
  if (!j) return null;
  const variant = String(j["lifecycle"]?.["@variant"] ?? "");
  const live = variant === "Live";
  const real = BigInt(j["real_quote_reserve"] ?? 0), target = BigInt(j["graduation_target"] ?? 0);
  const creatorRaw = j["creator"]?.["pos0"];
  return {
    factory: "Blast.fun v2",
    priceSui: live ? blastSpotSui({ virtualQuote: BigInt(j["virtual_quote"] ?? 0), realQuote: real, memeReserve: BigInt(j["meme_reserve"] ?? 0) }, decimals) : null,
    progress: live ? curveProgress(real, target) : 1,
    live,
    creator: typeof creatorRaw === "string" ? b64Address(creatorRaw) : null,
    totalSupply: j["atomic_supply"] ? Number(BigInt(j["atomic_supply"])) / 10 ** decimals : null,
  };
}

async function suipumpCurve(coinType: string): Promise<CurveState | null> {
  const { listSuipumpTokens, summarizeSuipumpToken } = await import("@/lib/terminal/suipump.server");
  const rows = await listSuipumpTokens();
  const row = rows.find((r) => r.tokenType === coinType);
  if (!row) return null;
  const s = summarizeSuipumpToken(row);
  return { factory: "Suipump", priceSui: s.graduated ? null : s.priceSui, progress: s.progress, live: !s.graduated, creator: row.creator || null, totalSupply: null };
}

/** Tries each launchpad; null when the token is not on a known curve. */
export async function readCurve(coinType: string, decimals: number): Promise<CurveState | null> {
  const [b, s] = await Promise.all([blastCurve(coinType, decimals).catch(() => null), suipumpCurve(coinType).catch(() => null)]);
  return b ?? s;
}
