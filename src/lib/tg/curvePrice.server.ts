// SPDX-License-Identifier: BUSL-1.1
/** Live in-curve prices read straight from launchpad objects, for tokens with no DEX pool yet. */
import { BLAST_V2_LAUNCH_PKG } from "@/lib/blast/contracts";
import { b64Address, blastSpotSui, curveProgress } from "./curvePrice";

export interface CurveState {
  factory: string;
  priceSui: number | null;
  /** Set instead of priceSui when the curve is quoted in USDC (Perpsplexity). */
  priceUsd?: number | null;
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

const PERPS_POOL = "0x97fea95545c04dc73f8174c6195013b100a26e3fa978e7cf8b100a51dfaf8354::pool::Pool";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/** Perpsplexity virtual pool: price = (virtual_quote + quote) / meme, quoted in USDC or SUI. */
async function perpsCurve(coinType: string, decimals: number): Promise<CurveState | null> {
  for (const [quote, qDec] of [[USDC, 6], [SUI, 9]] as const) {
    const d = await gql<{ objects?: { nodes?: { asMoveObject?: { contents?: { json?: Record<string, any> } }; dynamicFields?: { nodes?: { name?: { type?: { repr?: string } }; value?: { json?: Record<string, any> } }[] } }[] } }>(
      "query($t:String!){objects(first:1,filter:{type:$t}){nodes{asMoveObject{contents{json}} dynamicFields{nodes{name{type{repr}} value{... on MoveValue{json}}}}}}}",
      { t: `${PERPS_POOL}<${coinType}, ${quote}>` });
    const node = d?.objects?.nodes?.[0];
    const j = node?.asMoveObject?.contents?.json;
    if (!j) continue;
    const fields = node?.dynamicFields?.nodes ?? [];
    const curve = fields.find((f) => f.name?.type?.repr?.endsWith("::curve::CurveKey"))?.value?.json;
    const fees = fields.find((f) => f.name?.type?.repr?.endsWith("::pool::CreatorKey"))?.value?.json;
    const live = curve != null && Number(j["state"] ?? 0) === 0;
    const meme = Number(BigInt(j["meme"] ?? 0)) / 10 ** decimals;
    const q = (Number(BigInt(curve?.["virtual_quote"] ?? 0)) + Number(BigInt(j["quote"] ?? 0))) / 10 ** qDec;
    const spot = live && meme > 0 ? q / meme : null;
    const basis = BigInt(curve?.["basis"] ?? 0), target = BigInt(curve?.["bond_target"] ?? 0);
    return {
      factory: quote === USDC ? "Perpsplexity (USDC curve)" : "Perpsplexity (SUI curve)",
      priceSui: quote === SUI ? spot : null,
      priceUsd: quote === USDC ? spot : null,
      progress: live ? curveProgress(basis, target) : 1,
      live,
      creator: typeof fees?.["creator"] === "string" ? fees["creator"] : null,
      totalSupply: 1_000_000_000,
    };
  }
  return null;
}

/** Tries each launchpad; null when the token is not on a known curve. */
export async function readCurve(coinType: string, decimals: number): Promise<CurveState | null> {
  const [b, s, p] = await Promise.all([blastCurve(coinType, decimals).catch(() => null), suipumpCurve(coinType).catch(() => null), perpsCurve(coinType, decimals).catch(() => null)]);
  return b ?? s ?? p;
}
