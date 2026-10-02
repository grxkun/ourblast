// SPDX-License-Identifier: BUSL-1.1
/** Gas reserve policy — shared by the browser and the server. */

/** SUI needed to start sponsoring launch transactions. */
export const GAS_RESERVE_INITIAL_SUI = 1;

/** Skimmed into the reserve each time a creator claims launchpad fees. */
export const GAS_RESERVE_TOPUP_SUI = 0.01;

/** Below this the reserve is considered too low to sponsor reliably. */
export const GAS_RESERVE_LOW_SUI = 0.2;

export type GasReserveStatus = {
  created: boolean;
  address: string | null;
  balanceSui: number;
  contributedSui: number;
  low: boolean;
};
