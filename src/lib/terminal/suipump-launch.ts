/**
 * Client-safe description of the Suipump launch integration.
 *
 * What we verified on chain (mainnet package below, module `bonding_curve`):
 *  - trading (`buy` / `sell`) is permissionless;
 *  - creating a token calls `create_with_launch_fee`, which consumes a
 *    `LaunchTicket<T>` and a `coin::TreasuryCap<T>`;
 *  - tickets can only be minted by `issue_launch_ticket`, which needs the
 *    `LaunchIssuerCap` held by the Suipump team.
 *
 * So the adapter is fully built but stays inert until the OurBlastBot deployer
 * address holds a launch ticket. Nothing here ever fakes a deployment.
 */

export const SUIPUMP_PACKAGE_DEFAULT =
  "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0";

export const SUIPUMP_MODULE = "bonding_curve";
export const SUIPUMP_CREATE_FUNCTION = "create_with_launch_fee";
export const SUIPUMP_TICKET_TYPE = "LaunchTicket";

/** Everything an operator can configure without a code change. */
export interface SuipumpLaunchConfig {
  packageId: string;
  /** Shared `LaunchIssuerRegistry` object id. */
  registryId: string | null;
  /** Launch fee the create call expects, in MIST. OurBlast charges 0 on top. */
  launchFeeMist: number;
  /** The two trailing byte options on the create call, supplied by Suipump. */
  optionA: number;
  optionB: number;
  /** Master switch: real transactions are only signed when this is on. */
  enabled: boolean;
}

export interface SuipumpDeployerStatus {
  /** OurBlastBot wallet that would sign the launch. */
  deployerAddress: string | null;
  packageId: string;
  registryConfigured: boolean;
  enabled: boolean;
  /** Launch tickets currently held by the deployer. */
  tickets: number;
  /** Treasury caps held by the deployer (one coin package per token). */
  treasuryCaps: number;
  /** Coin types where a ticket and a matching treasury cap are both present. */
  launchableTypes: string[];
  balanceSui: number;
  ready: boolean;
  /** Plain-language list of what is still missing. */
  missing: string[];
}

export interface SuipumpLaunchResult {
  status: "CONFIRMED" | "NOT_IMPLEMENTED" | "FAILED";
  message: string;
  tokenAddress: string | null;
  transactionDigest: string | null;
}
