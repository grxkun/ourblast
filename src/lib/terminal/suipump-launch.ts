// SPDX-License-Identifier: BUSL-1.1
/**
 * Client-safe description of the Suipump launch integration.
 *
 * Suipump is permissionless: there is no wallet whitelist and no private API.
 * The public launch flow a normal suipump.org user performs is exactly three steps,
 * all of which OurBlast can perform with its own wallet:
 *
 *  1. publish a one-module coin package built from the public template at
 *     https://suipump.org/template.mv (metadata patched into its constants);
 *  2. ask Suipump's public launch-ticket issuer to mint a `LaunchTicket` to the
 *     wallet that holds the new `TreasuryCap` — the issuer verifies the published
 *     bytecode against the template and mints for anyone who publishes correctly;
 *  3. call `bonding_curve::create_and_return` with the treasury cap, registry,
 *     ticket and launch fee, then `bonding_curve::share_curve` — the two-step
 *     create their 2026-09-21 package upgrade introduced.
 *
 * Trading (`buy` / `sell`) is permissionless. Nothing here ever fakes a deployment:
 * a launch is only reported when Sui confirms the curve object.
 */

/**
 * Suipump V17 (current mainnet lineage). The lineage identity stays
 * 0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0; this is
 * the latest write package after their 2026-09-21 upgrade (version 5), which
 * replaced `create_with_launch_fee` with `create_and_return` + `share_curve`.
 */
export const SUIPUMP_PACKAGE_DEFAULT =
  "0x70a9b28a28c028e5ab9ed9fefec26f1fc43918bc094d60527b8968fb4f5ab0b5";

/** Shared `LaunchIssuerRegistry` the V17 create call reads. */
export const SUIPUMP_REGISTRY_DEFAULT =
  "0xb622741bfcfd6ef13b40c2d5c2adc8d796f68b3b1254fabaa571bffa3a91e875";

export const SUIPUMP_MODULE = "bonding_curve";
export const SUIPUMP_CREATE_FUNCTION = "create_and_return";
export const SUIPUMP_SHARE_FUNCTION = "share_curve";
export const SUIPUMP_TICKET_TYPE = "LaunchTicket";

/** Public coin template and launch-ticket issuer used by suipump.org itself. */
export const SUIPUMP_TEMPLATE_URL_DEFAULT = "https://suipump.org/template.mv";
export const SUIPUMP_ISSUER_URL_DEFAULT = "https://suipump-mainet-issuer.onrender.com";
/**
 * Build key the suipump.org client ships publicly to every browser; it identifies
 * the calling build, not a wallet. Override with SUIPUMP_ISSUER_KEY if Suipump
 * gives OurBlast its own.
 */
export const SUIPUMP_ISSUER_KEY_DEFAULT =
  "5ec7e4dd0e9bac9a017f4e46ecb305e28ad9dfe18a5d19347570d48e1ec930a5";

/** Launch fee the create call expects, in SUI. OurBlast charges nothing on top. */
export const SUIPUMP_LAUNCH_FEE_SUI_DEFAULT = 2;

/** Everything an operator can configure without a code change. */
export interface SuipumpLaunchConfig {
  packageId: string;
  registryId: string;
  templateUrl: string;
  issuerUrl: string;
  issuerKey: string;
  /** Launch fee in MIST. */
  launchFeeMist: number;
  decimals: number;
  /** The two trailing byte options on the create call. */
  optionA: number;
  optionB: number;
  /** Master switch: real transactions are only signed when this is on. */
  enabled: boolean;
}

export interface SuipumpDeployerStatus {
  /** OurBlastBot wallet that publishes, holds the ticket and signs the launch. */
  deployerAddress: string | null;
  packageId: string;
  registryConfigured: boolean;
  issuerConfigured: boolean;
  enabled: boolean;
  balanceSui: number;
  /** SUI the wallet needs available for one launch (fee + publish + gas). */
  requiredSui: number;
  ready: boolean;
  /** Plain-language list of what is still missing. */
  missing: string[];
}

export interface SuipumpLaunchResult {
  status: "CONFIRMED" | "NOT_IMPLEMENTED" | "FAILED";
  message: string;
  tokenAddress: string | null;
  transactionDigest: string | null;
  /** Coin type of the published package, when it got that far. */
  coinType?: string | null;
  /** Set when the launch confirmed but the creator's first buy did not happen. */
  devBuyError?: string | null;
}
