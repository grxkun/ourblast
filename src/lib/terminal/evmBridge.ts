// SPDX-License-Identifier: BUSL-1.1
/**
 * "bridge 0.013 bnb to sui" / "bridge all bnb" / "bridge 0.002 eth on base to sui":
 * move an exact (or all) native amount from the user's OurBank EVM address to Sui.
 * The SUI stays in the wallet — nothing is auto-bought.
 */
export type EvmBridgeCommand = { asset: "ETH" | "BNB"; amount: number | "all"; chain?: "base" | "arbitrum" };

const RE = /^(?:bridge|sweep|move)\s+(?:(all|max|everything|my|(?:\d+(?:\.\d+)?|\.\d+))\s+)?(?:of\s+)?(?:my\s+)?(bnb|eth)(?:\s+(?:on|from)\s+(base|arbitrum|arb|bsc|bnb\s+chain))?(?:\s+(?:to|into)\s+(?:my\s+)?sui(?:\s+wallet)?)?$/i;

export function parseEvmBridgeCommand(text: string): EvmBridgeCommand | null {
  const clean = text
    .replace(/@[a-z0-9_]{1,15}/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,!?]+$/g, "");
  const m = clean.match(RE);
  if (!m) return null;
  const asset = m[2]!.toUpperCase() as "ETH" | "BNB";
  const net = m[3]?.toLowerCase();
  const chain = net === "base" ? "base" : net === "arbitrum" || net === "arb" ? "arbitrum" : undefined;
  if (asset === "BNB" && chain) return null;
  if (asset === "ETH" && net && !chain) return null;
  const a = m[1]?.toLowerCase();
  if (!a || a === "all" || a === "max" || a === "everything" || a === "my") return { asset, amount: "all", ...(chain ? { chain } : {}) };
  const amount = Number(a);
  return Number.isFinite(amount) && amount > 0 ? { asset, amount, ...(chain ? { chain } : {}) } : null;
}
