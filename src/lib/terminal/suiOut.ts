// SPDX-License-Identifier: BUSL-1.1
/**
 * Outbound bridge from the OurBank Sui wallet.
 * SOL: SUI → SOL directly (NEAR Intents 1Click).
 * ETH (Base/Arbitrum) and BNB: SUI → SOL (leg 1) into the user's OurBank Solana
 * address, then the poller sends that SOL on (leg 2: 1Click for ETH, Relay for BNB and Robinhood Chain ETH).
 */
export type SuiOutTarget = "SOL" | "ETH_BASE" | "ETH_ARB" | "ETH_RH" | "BNB";
export type SuiOutCommand = { amountSui: number; target: SuiOutTarget; destination?: string };

export const SUI_OUT_MIN = 5; // SUI
export const SUI_OUT_GAS_KEEP = 0.1; // SUI left for fees
/** SOL kept on Solana after leg 2 (fees + rent). */
export const HOP_SOL_KEEP = 3_000_000n;
/** Leg 1 counts as arrived once this share of the quoted SOL has landed. */
export const HOP_ARRIVAL_SHARE = 0.9;
export const HOP_TIMEOUT_MS = 60 * 60_000;

export const TARGET_LABEL: Record<SuiOutTarget, string> = { SOL: "SOL", ETH_BASE: "ETH on Base", ETH_ARB: "ETH on Arbitrum", ETH_RH: "ETH on Robinhood Chain", BNB: "BNB" };

const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const RE = new RegExp(
  `^(?:bridge|send|move|swap)\\s+${NUM}\\s+\\$?sui\\s+(?:to|into|on)\\s+(sol|solana|eth|base|arb|arbitrum|rh|robinhood|bnb|bsc|evm)(?:\\s+(?:on\\s+)?(base|arb|arbitrum|rh|robinhood)(?:\\s+chain)?)?(?:\\s+(\\S+))?$`,
  "i",
);

function targetOf(word: string, chain?: string): SuiOutTarget {
  const w = word.toLowerCase();
  if (w.startsWith("sol")) return "SOL";
  if (w === "bnb" || w === "bsc") return "BNB";
  if (w === "rh" || w === "robinhood" || chain?.toLowerCase() === "rh" || chain?.toLowerCase() === "robinhood") return "ETH_RH";
  if (w.startsWith("arb") || chain?.toLowerCase().startsWith("arb")) return "ETH_ARB";
  return "ETH_BASE";
}

export function parseSuiOutCommand(text: string): SuiOutCommand | null {
  const clean = text.replace(/@[a-z0-9_]{1,15}(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim().replace(/[\s.,!?]+$/g, "");
  const m = clean.match(RE);
  if (!m) return null;
  const amountSui = Number(m[1]);
  if (!Number.isFinite(amountSui) || amountSui <= 0) return null;
  const target = targetOf(m[2]!, m[3]);
  const dest = m[4];
  if (dest && !(target === "SOL" ? SOL_ADDR : EVM_ADDR).test(dest)) return null;
  return dest ? { amountSui, target, destination: dest } : { amountSui, target };
}

/** Why an amount can't go, given the wallet's SUI balance; null = OK. */
export function suiOutProblem(amountSui: number, balanceSui: number): string | null {
  if (amountSui < SUI_OUT_MIN) return `Minimum is ${SUI_OUT_MIN} SUI.`;
  if (amountSui + SUI_OUT_GAS_KEEP > balanceSui) return `Not enough SUI — you have ${balanceSui.toFixed(3)} and ${SUI_OUT_GAS_KEEP} SUI stays for fees.`;
  return null;
}

/** Leg 2 amount once leg 1 has landed: the newly arrived SOL minus the keep; null = not yet. */
export function hopLeg2Lamports(balance: bigint, baseline: bigint, expected: bigint): bigint | null {
  const arrived = balance - baseline;
  if (arrived < BigInt(Math.floor(Number(expected) * HOP_ARRIVAL_SHARE))) return null;
  const send = (arrived < expected ? arrived : expected) - HOP_SOL_KEEP;
  return send > 0n ? send : null;
}
