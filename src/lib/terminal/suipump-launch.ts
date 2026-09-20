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
 *  3. call `bonding_curve::create_with_launch_fee` with the ticket, treasury cap
 *     and launch fee, which creates and shares the bonding curve.
 *
 * Trading (`buy` / `sell`) is permissionless. Nothing here ever fakes a deployment:
 * a launch is only reported when Sui confirms the curve object.
 */

/** Suipump V17 (current mainnet lineage). */
export const SUIPUMP_PACKAGE_DEFAULT =
  "0xb205fea41ccedac051bc66498e6ca68cb802c4a6ea06da12e524bed09c80d9b0";

/** Shared `LaunchIssuerRegistry` the V17 create call reads. */
export const SUIPUMP_REGISTRY_DEFAULT =
  "0xb622741bfcfd6ef13b40c2d5c2adc8d796f68b3b1254fabaa571bffa3a91e875";

export const SUIPUMP_MODULE = "bonding_curve";
export const SUIPUMP_CREATE_FUNCTION = "create_with_launch_fee";
export const SUIPUMP_TICKET_TYPE = "LaunchTicket";

/** Public coin template and launch-ticket issuer used by suipump.org itself. */
export const SUIPUMP_TEMPLATE_URL_DEFAULT = "https://suipump.org/template.mv";
export const SUIPUMP_ISSUER_URL_DEFAULT = "https://suipump-mainet-issuer.onrender.com";

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
}
