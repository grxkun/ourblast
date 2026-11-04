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

/**
 * Suipump V18 lineage (suipump.org launches V18 only since 2026-11). The
 * defining package names the types; the write package receives calls.
 * V18 refuses to share a curve that has no Cetus PoolCreationCap attached
 * (EPoolCapMissing), so every V18 launch carries pool protection: the coin's
 * Cetus pool can only be created by the curve at graduation, never by a
 * sniper front-running it.
 */
export const SUIPUMP_V18_DEFINING =
  "0x96a8523e464fdb6c1bb267404621cf47fcd3234d168b724b660995a420b439e3";
export const SUIPUMP_V18_WRITE =
  "0x511114ba2a5af7bb6b21ab243fb4d2fd8b23105ae7be086785abd2916ea2d99b";
export const SUIPUMP_V18_REGISTRY =
  "0x12390146d8bfd33f07890fc60477c91eeb93196ce551c59dbd2f52c7f318c884";
export const SUIPUMP_V18_PRICE_CONFIG =
  "0xb3e2b3afaad92555a62b26559ab5ff69ee295fa618fdc1971d37f96dce51ddfc";
/** Cetus CLMM objects Suipump's own client uses for V18 pool protection. */
export const CETUS_CLMM_PUBLISHED_AT =
  "0x260693ec785a6e6c9d81d58c7d2ff72f1288ae0fa6a9725abe05a6478b11f084";
export const CETUS_GLOBAL_CONFIG = {
  objectId: "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f",
  initialSharedVersion: "1574190",
};
export const CETUS_POOLS = {
  objectId: "0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0",
  initialSharedVersion: "1574190",
};
/** Tick spacing Suipump registers for the protected TOKEN/SUI pair. */
export const CETUS_PROTECTED_TICK_SPACING = 200;
export const SUI_COIN_TYPE = "0x2::sui::SUI";

/** True when a LaunchTicket type belongs to the V18 lineage. */
export function isV18TicketType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t.startsWith(`${SUIPUMP_V18_DEFINING}::authority::launchticket<`);
}
