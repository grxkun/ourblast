// SPDX-License-Identifier: BUSL-1.1
/**
 * Outbound bridge: SUI from the OurBank Sui wallet → native SOL on Solana
 * (NEAR Intents 1Click). "bridge 10 sui to sol", "bridge 10 sui to sol <addr>",
 * "send 10 sui to solana". EVM targets are recognised so we can say why they're refused.
 */
export type SuiOutCommand = { amountSui: number; target: "SOL" | "EVM"; destination?: string };

export const SUI_OUT_MIN = 5; // SUI
export const SUI_OUT_GAS_KEEP = 0.1; // SUI left for fees

const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RE = new RegExp(`^(?:bridge|send|move|swap)\\s+${NUM}\\s+\\$?sui\\s+(?:to|into|on)\\s+(sol|solana|eth|base|arb|arbitrum|bnb|bsc|evm)(?:\\s+(\\S+))?$`, "i");

export function parseSuiOutCommand(text: string): SuiOutCommand | null {
  const clean = text.replace(/@[a-z0-9_]{1,15}(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim().replace(/[\s.,!?]+$/g, "");
  const m = clean.match(RE);
  if (!m) return null;
  const amountSui = Number(m[1]);
  if (!Number.isFinite(amountSui) || amountSui <= 0) return null;
  const target = /^sol/i.test(m[2]!) ? "SOL" : "EVM";
  const dest = m[3];
  if (dest && target === "SOL" && !SOL_ADDR.test(dest)) return null;
  return dest ? { amountSui, target, destination: dest } : { amountSui, target };
}

/** Why an amount can't go, given the wallet's SUI balance; null = OK. */
export function suiOutProblem(amountSui: number, balanceSui: number): string | null {
  if (amountSui < SUI_OUT_MIN) return `Minimum is ${SUI_OUT_MIN} SUI.`;
  if (amountSui + SUI_OUT_GAS_KEEP > balanceSui) return `Not enough SUI — you have ${balanceSui.toFixed(3)} and ${SUI_OUT_GAS_KEEP} SUI stays for fees.`;
  return null;
}
