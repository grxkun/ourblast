// SPDX-License-Identifier: BUSL-1.1
/**
 * Anti-spam launch fee for X launches.
 *
 * Every launch called in from X costs the caller 1 SUI, paid out of their own
 * OurBank wallet to the @ourblastbot wallet before anything touches a
 * launchpad. Perpsplexity also charges a 5 SUI launchpad fee on chain, which
 * the bot fronts, so those launches collect that too.
 *
 * Pure math and wording only — the signing and sending lives in
 * launchFee.server.ts.
 */

export const MIST_PER_SUI = 1_000_000_000n;

/** OurBlast's own anti-spam fee, charged on every X launch. */
export const OURBLAST_LAUNCH_FEE_MIST = 1n * MIST_PER_SUI;

/** On-chain launchpad fee the bot fronts, reimbursed by the caller so the bot never pays it. */
export const PAD_LAUNCH_FEE_MIST: Record<string, bigint> = {
  suipump: 2n * MIST_PER_SUI,
  popular: 1n * MIST_PER_SUI,
  ript: 1n * MIST_PER_SUI,
  perpsplexity: 5n * MIST_PER_SUI,
};

/** Gas headroom the caller must keep after the fee is taken. */
export const LAUNCH_GAS_HEADROOM_MIST = 4n * MIST_PER_SUI;

/** Total SUI charged for a launch on `padId`. */
export function launchFeeMist(padId: string): bigint {
  return OURBLAST_LAUNCH_FEE_MIST + (PAD_LAUNCH_FEE_MIST[padId] ?? 0n);
}

/** Minimum OurBank SUI balance required before a launch is attempted. */
export function requiredBalanceMist(padId: string): bigint {
  return launchFeeMist(padId) + LAUNCH_GAS_HEADROOM_MIST;
}

export function formatSui(mist: bigint): string {
  const whole = mist / MIST_PER_SUI;
  const rest = mist % MIST_PER_SUI;
  if (rest === 0n) return whole.toString();
  return `${whole}.${rest.toString().padStart(9, "0").replace(/0+$/, "")}`;
}

/** Wording used when the caller has no OurBank wallet linked. */
export function noWalletNotice(fromTerminal = false): string {
  return fromTerminal
    ? "No OurBank wallet found for your account. Open the OurBank card in the terminal, create your wallet, top it up, then launch again."
    : "No OurBank wallet linked to your X account. Open https://ourblast.xyz/terminal, link it, top it up, then post the launch again.";
}

/** Wording used when the caller's OurBank wallet is too light. */
export function lowBalanceNotice(padId: string, balanceMist: bigint): string {
  return `Not enough SUI in your OurBank wallet: ${formatSui(balanceMist)} SUI. A launch needs ${formatSui(
    requiredBalanceMist(padId),
  )} SUI (${formatSui(launchFeeMist(padId))} SUI launch fee + network fees). Top up at https://ourblast.xyz/terminal, then post again.`;
}
