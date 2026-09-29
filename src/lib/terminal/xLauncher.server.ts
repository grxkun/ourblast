import { BOT_WALLET_ADDRESS, DEFAULT_TREASURY_ADDRESS, FOUNDER_ADDRESS } from "@/lib/ourblast.config";
import { CREATOR_FEE_SPLIT } from "./fees";
import { poolPageUrl, resolveLaunchpad, resolvePairToken, tokenPageUrl } from "./launchpad";
import { launchpadAdapter } from "./launchpadAdapter";
import {
  DEFAULT_LAUNCHER_SETTINGS,
  parseDeployTweet,
  type DeployRequest,
  type LauncherSettings,
  type LaunchRequestStatus,
} from "./xLauncher";
import type { LaunchConfiguration } from "./types";
import { extractDescription, extractPairToken, extractSocials, tokenIconUrl } from "./xLauncher";

/**
 * Server side of the simple X launcher. Every state change lives here so the
 * browser only ever sees launch-relevant information: ticker, name, launchpad,
 * dev buy, fee and (once confirmed) the token and pool links.
 */

export interface LaunchRequestRow {
  id: string;
  x_post_id: string;
  x_username: string;
  symbol: string;
  name: string;
  launchpad: string;
  dev_buy: boolean;
  ourblast_fee_percent: number;
  status: LaunchRequestStatus;
  token_address: string | null;
  token_url: string | null;
  pool_url: string | null;
  notice: string | null;
  /** Picture from the tweet, used as the coin's image metadata. */
  icon_url: string | null;
  /** The caller's original tweet text, quoted in the coin's description. */
  tweet_text: string | null;
  /** Creator-fee receiver named in the tweet ("Set @adiniyi as fee receiver"). */
  fee_receiver_x_username: string | null;
  fee_receiver_wallet: string | null;
  /** Perpsplexity market-backed launch fields (null for plain launches). */
  underlying: string | null;
  perps_long: boolean | null;
  leverage_bps: number | null;
  starting_cap_usd: number | null;
  /** Perpsplexity only: the launcher's opening buy in USDC (null = none). */
  dev_buy_usdc: number | null;
  created_at: string;
}

const INTEGRATION_PENDING = "Launchpad integration coming soon.";

/**
 * On-chain creator-fee routing. The published split — 20% OURBLAST treasury,
 * 10% developer, 10% treasury, 70% launcher — is written straight into the bonding curve.
 *
 * When we know the launcher's wallet (their X account is linked to an OURBLAST
 * profile) their 70% goes to that wallet on chain. A claim/verification link is
 * still posted in the X reply so the recipient can prove and remember their
 * payout route. When no wallet is known, the bot wallet holds their share until
 * that same X handle claims it. SUIPUMP_FEE_PAYEES still overrides everything
 * with equal shares.
 */
function toBps(share: number): number {
  return Math.round(share * 10_000);
}

function treasuryPayee(): string {
  return (process.env['OURBLAST_TREASURY_ADDRESS']?.trim() || DEFAULT_TREASURY_ADDRESS).toLowerCase();
}

function overridePayees(): string[] {
  return (process.env['SUIPUMP_FEE_PAYEES'] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^0x[0-9a-fA-F]{64}$/.test(value));
}

/** The launcher's own Sui wallet, when their X handle is linked to a profile. */
async function launcherWallet(xUsername: string): Promise<string | null> {
  if (!xUsername) return null;
  const client = await db();
  const { data: account } = await client
    .from("x_accounts")
    .select("user_id")
    .ilike("username", xUsername)
    .maybeSingle();
  if (!account?.user_id) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("wallet_address")
    .eq("id", account.user_id)
    .maybeSingle();
  const wallet = (profile?.wallet_address ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(wallet) ? wallet : null;
}

interface FeeRouting {
  payees: string[];
  shareBps: number[];
  /** True when the launcher's 70% is paid straight to their own wallet. */
  launcherPaidOnChain: boolean;
}

/**
 * The handle whose wallet receives the launcher's 70%: the fee receiver named
 * in the tweet when there is one, otherwise the caller themselves.
 */
export function feeReceiverHandle(row: {
  x_username: string;
  fee_receiver_x_username?: string | null;
}): string {
  return (row.fee_receiver_x_username ?? row.x_username ?? "").replace(/^@/, "");
}

async function feeRouting(
  xUsername: string,
  receiver?: { handle?: string | null; wallet?: string | null },
): Promise<FeeRouting> {
  const configured = overridePayees();
  if (configured.length > 0) {
    const even = Math.floor(10_000 / configured.length);
    return {
      payees: configured,
      shareBps: configured.map((_, index) => (index === 0 ? 10_000 - even * (configured.length - 1) : even)),
      launcherPaidOnChain: false,
    };
  }

  // The bot wallet receives OURBLAST's 10% ops & gas share.
  const bot = (process.env['OURBLAST_BOT_WALLET_ADDRESS']?.trim() || BOT_WALLET_ADDRESS).toLowerCase();
  const developer = FOUNDER_ADDRESS.toLowerCase();
  const treasury = treasuryPayee();
  // A tweet may hand the creator fees to someone else ("Set @adiniyi as fee
  // receiver"): that wallet takes the launcher's 70% instead.
  const named = (receiver?.wallet ?? "").trim().toLowerCase();
  const launcher = /^0x[0-9a-f]{64}$/.test(named)
    ? named
    : (receiver?.handle ? await launcherWallet(receiver.handle) : null) ?? (receiver?.handle ? null : await launcherWallet(xUsername));
  const botShareBps = toBps(CREATOR_FEE_SPLIT.bot);
  const treasuryBps = toBps(CREATOR_FEE_SPLIT.treasury);
  if (launcher && launcher !== bot && launcher !== developer && launcher !== treasury) {
    return {
      payees: [bot, developer, treasury, launcher],
      shareBps: [
        botShareBps,
        toBps(CREATOR_FEE_SPLIT.developer),
        treasuryBps,
        toBps(CREATOR_FEE_SPLIT.launcher),
      ],
      launcherPaidOnChain: true,
    };
  }

  // No known launcher wallet: the bot wallet holds their share until they claim it.
  return {
    payees: [bot, developer, treasury],
    shareBps: [
      botShareBps + toBps(CREATOR_FEE_SPLIT.launcher),
      toBps(CREATOR_FEE_SPLIT.developer),
      treasuryBps,
    ],
    launcherPaidOnChain: false,
  };
}

/** Auto-creates the one-time claim/verification link for a launcher's fee share. */
async function ensureFeeClaimLink(symbol: string, xUsername: string): Promise<string | null> {
  if (!xUsername) return null;
  const client = await db();
  const { data: existing } = await client
    .from("fee_claim_links")
    .select("token")
    .eq("launch_symbol", symbol.toUpperCase())
    .eq("x_username", xUsername)
    .eq("status", "pending")
    .maybeSingle();
  if (existing?.token) return existing.token;

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { error } = await client.from("fee_claim_links").insert({
    token,
    launch_symbol: symbol.toUpperCase(),
    x_username: xUsername,
    amount_sui: 0,
  });
  if (error) {
    console.error(`Fee claim link failed for ${symbol}: ${error.message}`);
    return null;
  }
  return token;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readLauncherSettings(): Promise<LauncherSettings> {
  const client = await db();
  const { data } = await client
    .from("launcher_settings")
    .select("default_launchpad, ourblast_fee_percent, dev_buy_enabled, auto_launch_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULT_LAUNCHER_SETTINGS;
  return {
    defaultLaunchpad: data.default_launchpad,
    ourblastFeePercent: Number(data.ourblast_fee_percent),
    devBuyEnabled: data.dev_buy_enabled,
    autoLaunchEnabled: data.auto_launch_enabled,
  };
}

export async function writeLauncherSettings(settings: LauncherSettings): Promise<LauncherSettings> {
  const client = await db();
  const pad = resolveLaunchpad(settings.defaultLaunchpad);
  const { error } = await client
    .from("launcher_settings")
    .upsert(
      {
        id: true,
        default_launchpad: pad.id,
        ourblast_fee_percent: Math.min(50, Math.max(0, settings.ourblastFeePercent)),
        dev_buy_enabled: settings.devBuyEnabled,
        // Automatic launching stays off while no launchpad integration is verified.
        auto_launch_enabled: settings.autoLaunchEnabled && pad.integrated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error("Those settings could not be saved.");
  return readLauncherSettings();
}

/** Reads a launch request out of a tweet. Returns null when the tweet is not a deploy call. */
export async function readDeployRequest(text: string): Promise<DeployRequest | null> {
  const settings = await readLauncherSettings();
  return parseDeployTweet(text, settings.defaultLaunchpad);
}

/**
 * One X post = one launch request. The unique post id in the table is the whole
 * duplicate protection: a repeated mention resolves to the existing row.
 */
export async function createLaunchRequest(
  postId: string,
  username: string,
  request: DeployRequest,
  iconUrl?: string | null,
  tweetText?: string | null,
): Promise<LaunchRequestRow> {
  const client = await db();
  const settings = await readLauncherSettings();
  const pad = resolveLaunchpad(request.launchpad);
  // "set fee to doni.sui": resolve the name now so the routed wallet is fixed at request time.
  let feeWallet = request.feeReceiver?.wallet ?? null;
  if (!feeWallet && request.feeReceiver?.suins) {
    const { resolveRecipient } = await import("./bank.server");
    feeWallet = await resolveRecipient("suins", request.feeReceiver.suins);
  }

  const { data: existing } = await client
    .from("x_launch_requests")
    .select("*")
    .eq("x_post_id", postId)
    .maybeSingle();
  if (existing) return existing as LaunchRequestRow;

  const { data, error } = await client
    .from("x_launch_requests")
    .insert({
      x_post_id: postId,
      x_username: username.replace(/^@/, "").slice(0, 40),
      symbol: request.symbol,
      name: request.name,
      launchpad: pad.id,
      dev_buy: settings.devBuyEnabled,
      ourblast_fee_percent: settings.ourblastFeePercent,
      icon_url: iconUrl?.slice(0, 500) ?? null,
      tweet_text: tweetText?.slice(0, 1000) ?? null,
      fee_receiver_x_username: request.feeReceiver?.handle ?? null,
      fee_receiver_wallet: feeWallet,
      underlying: request.perps?.underlying ?? null,
      perps_long: request.perps ? request.perps.long : null,
      leverage_bps: request.perps?.leverageBps ?? null,
      starting_cap_usd: request.perps?.startingCapUsd ?? null,
      dev_buy_usdc: request.devBuyUsdc ?? null,
      status: "PENDING",
      notice: pad.integrated ? null : INTEGRATION_PENDING,
    })
    .select("*")
    .single();
  if (error) {
    // Raced with another poll on the same post: the existing row wins.
    const { data: row } = await client.from("x_launch_requests").select("*").eq("x_post_id", postId).maybeSingle();
    if (row) return row as LaunchRequestRow;
    throw new Error("That launch request could not be recorded.");
  }
  return data as LaunchRequestRow;
}

function launchConfigFor(row: LaunchRequestRow): LaunchConfiguration {
  const pad = resolveLaunchpad(row.launchpad);
  return {
    name: row.name,
    symbol: row.symbol,
    description: "",
    image: row.icon_url,
    network: "sui",
    launchpad: pad.label,
    pairToken: resolvePairToken(pad, extractPairToken(row.tweet_text ?? "")),
    liquidity: pad.liquidity.default,
    // Developer buying stays off unless an operator switches it on.
    devBuy: row.dev_buy ? pad.liquidity.min : 0,
    totalSupply: pad.supply.default,
    feePayout: { mode: "creator", wallet: null, xUsername: row.x_username },
  };
}

/**
 * The wallet that funds and receives a first ("dev") buy: the creator's own
 * OurBank wallet, resolved from the X handle that asked for the launch. The
 * bot's operating wallet is never used for it — it only covers gas, the
 * launchpad fee and the pool seed. Returns null when the creator has no
 * wallet, in which case the launch happens without a first buy.
 */
async function creatorDevBuyer(
  row: LaunchRequestRow,
): Promise<{ address: string; signer: { signTransaction(bytes: Uint8Array): Promise<{ signature: string }> } } | null> {
  const handle = row.x_username?.trim();
  if (!handle) return null;
  try {
    const { findBankWallet, bankSigner } = await import("./bank-wallet.server");
    const wallet = await findBankWallet(handle);
    if (!wallet) return null;
    const signer = await bankSigner(wallet);
    return { address: signer.address, signer };
  } catch {
    return null;
  }
}


export interface LaunchOutcome {
  status: LaunchRequestStatus;
  notice: string | null;
  tokenUrl: string | null;
  poolUrl: string | null;
}

/**
 * Performs the launch with the backend-held OurBlast Sui wallet. Until a
 * launchpad exposes a verified launch API/contract the adapter reports that it
 * is not connected and the request is parked — never faked as deployed.
 */
export async function executeLaunchRequest(requestId: string): Promise<LaunchOutcome> {
  const client = await db();
  const { data: row } = await client.from("x_launch_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row) throw new Error("That launch request no longer exists.");
  const request = row as LaunchRequestRow;
  if (request.status === "DEPLOYED") {
    return { status: "DEPLOYED", notice: null, tokenUrl: request.token_url, poolUrl: request.pool_url };
  }

  // One mention = one deployment. Claiming the row atomically means a second
  // poll, retry or manual press can never launch the same request twice.
  const { data: claimed } = await client
    .from("x_launch_requests")
    .update({ status: "LAUNCHING", updated_at: new Date().toISOString() })
    .eq("id", request.id)
    .in("status", ["PENDING", "UNAVAILABLE", "FAILED"])
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: current } = await client
      .from("x_launch_requests")
      .select("status, notice, token_url, pool_url")
      .eq("id", request.id)
      .maybeSingle();
    return {
      status: ((current?.status as LaunchRequestStatus | undefined) ?? "LAUNCHING"),
      notice: current?.notice ?? "This launch is already running.",
      tokenUrl: current?.token_url ?? null,
      poolUrl: current?.pool_url ?? null,
    };
  }

  const pad = resolveLaunchpad(request.launchpad);
  let deployment: { tokenAddress: string; transactionDigest: string } | undefined;
  let failure: string | null = null;
  // Perpsplexity's own pool page, so the reply links the market, not a homepage.
  let perpsPoolId: string | null = null;
  let blastPoolObjectId: string | null = null;
  let maelstromPoolId: string | null = null;
  // Set when the launch confirmed but the creator's first buy did not happen.
  let devBuyNotice: string | null = null;

  const socials = extractSocials(request.tweet_text ?? "");
  const socialLine = [
    socials.website ? `Web: ${socials.website}` : "",
    socials.telegram ? `TG: ${socials.telegram}` : "",
    socials.x ? `X: ${socials.x}` : "",
  ].filter(Boolean).join(" ");
  const withSocials = (d: string) => [socialLine, d].filter(Boolean).join(" | ");
  // Terminal launches store internal notes (e.g. "paired with $SUI"), never a tweet.
  const isTerminalLaunch = String(request.x_post_id ?? "").startsWith("terminal-");
  // Only real X posts get a deploy link; terminal launches have no tweet.
  const deployLink = request.x_username && request.x_post_id && /^\d+$/.test(request.x_post_id)
    ? `https://x.com/${request.x_username}/status/${request.x_post_id}` : "";
  // Clean bio: the launcher's own "Desc:" or a generated summary, then the
  // deploying X post and socials. Never the raw command tweet.
  const richDescription = (padName: string) => {
    const own = extractDescription(request.tweet_text ?? "");
    const lev = request.leverage_bps ? `${Math.round(Number(request.leverage_bps) / 1000) / 10}x` : "3x";
    const base = own || (request.underlying
      ? `${request.name} ($${request.symbol}) is a ${lev} ${request.perps_long === false ? "SHORT" : "LONG"} ${String(request.underlying).toUpperCase()} leveraged composite token deployed on ${padName} via OurBlast.`
      : `${request.name} ($${request.symbol}) deployed on ${padName} via OurBlast.`);
    return [base, deployLink ? `Deploy: ${deployLink}` : "", socialLine].filter(Boolean).join(" | ");
  };
  const routing = await feeRouting(request.x_username, {
    handle: request.fee_receiver_x_username,
    wallet: request.fee_receiver_wallet,
  });

  if (pad.id === "suipump") {
    // Real Suipump create call, signed by the OurBlastBot wallet. Stays inert
    // (NOT_IMPLEMENTED) until Suipump issues a launch ticket to that wallet.
    const { launchOnSuipump } = await import("./suipump-launch.server");
    const outcome = await launchOnSuipump({
      symbol: request.symbol,
      name: request.name,
      description: withSocials(extractDescription(request.tweet_text ?? "") ?? ""),
      // The picture from the tweet becomes the coin's image metadata.
      iconUrl: tokenIconUrl(request.icon_url),
      // The caller's X link goes into the coin's public info.
      callerXLink: request.x_username ? `https://x.com/${request.x_username}` : null,
      // The caller's original tweet is quoted in the coin's public info.
      // When the caller wrote their own "Desc:", that is the coin's info instead.
      callerTweetText: extractDescription(request.tweet_text ?? "") || socialLine || isTerminalLaunch ? null : request.tweet_text ?? null,
      payees: routing.payees,
      shareBps: routing.shareBps,
    });
    if (outcome.status === "CONFIRMED" && outcome.tokenAddress) {
      deployment = { tokenAddress: outcome.tokenAddress, transactionDigest: outcome.transactionDigest ?? "" };
    } else if (outcome.status === "FAILED") {
      failure = outcome.message;
    }
  } else if (pad.id === "blastfun") {
    // Official Blast.fun flow: publish the coin, then open its bonding curve pool.
    const { launchOnBlastfun } = await import("./blastfun-launch.server");
    const outcome = await launchOnBlastfun({
      symbol: request.symbol,
      name: request.name,
      description: extractDescription(request.tweet_text ?? "") ?? (isTerminalLaunch ? "" : request.tweet_text ?? ""),
      iconUrl: tokenIconUrl(request.icon_url),
      xLink: socials.x ?? (request.x_username ? `https://x.com/${request.x_username}` : null),
      website: socials.website,
      telegram: socials.telegram,
    });
    if (outcome.status === "CONFIRMED" && outcome.coinType) {
      deployment = { tokenAddress: outcome.coinType, transactionDigest: outcome.digest ?? "" };
      blastPoolObjectId = outcome.poolId ?? null;
    } else {
      failure = outcome.error ?? "The Blast.fun launch did not confirm on chain.";
    }
  } else if (pad.id === "maelstrom") {
    // Maelstrom: one atomic call publishes nothing but the pool — the coin is
    // published first, then the launchpad opens a Cetus pool, adds the whole
    // float and locks the LP position forever.
    const { launchOnMaelstrom } = await import("./maelstrom-launch.server");
    const outcome = await launchOnMaelstrom({
      symbol: request.symbol,
      name: request.name,
      description: extractDescription(request.tweet_text ?? "") ?? (isTerminalLaunch ? "" : request.tweet_text ?? ""),
      iconUrl: tokenIconUrl(request.icon_url),
      website: socials.website,
      xLink: socials.x ?? (request.x_username ? `https://x.com/${request.x_username}` : null),
      telegram: socials.telegram,
      // Maelstrom routes the pool's LP fees to one address: the launcher's own
      // wallet when we know it, otherwise the bot wallet holds them.
      feeRecipient: routing.launcherPaidOnChain ? routing.payees[3] ?? null : null,
      // "paired with USDC" → a TOKEN/USDC Cetus pool; unsupported pairs fall back to SUI.
      quote: resolvePairToken(pad, extractPairToken(request.tweet_text ?? "")),
    });
    if (outcome.status === "CONFIRMED" && outcome.coinType && outcome.poolId) {
      deployment = { tokenAddress: outcome.coinType, transactionDigest: outcome.digest ?? "" };
      maelstromPoolId = outcome.poolId;
    } else {
      failure = outcome.error ?? "The Maelstrom launch did not confirm on chain.";
    }
  } else if (pad.id === "perpsplexity") {

    // Perpsplexity: when the post names an underlying market the launch is a
    // genuine leveraged (composite) pool — e.g. NVDA 3L — backed by an
    // Aftermath perp position. With no market it is the plain USDC curve.
    const { launchOnPerpsplexity } = await import("./perpsplexity-launch.server");
    const outcome = await launchOnPerpsplexity({
      symbol: request.symbol,
      name: request.name,
      description: richDescription("Perpsplexity"),
      iconUrl: tokenIconUrl(request.icon_url),
      underlying: request.underlying ?? null,
      long: request.perps_long ?? true,
      leverageBps: request.leverage_bps ?? null,
      startingCapUsd: request.starting_cap_usd ? Number(request.starting_cap_usd) : null,
      // "first buy 25" in the tweet: the creator's own opening buy on the new
      // pool. Absent = no buy at all.
      devBuyUsdc: request.dev_buy_usdc ? Number(request.dev_buy_usdc) : null,
      // The first buy is funded by, and delivered to, the creator's own OurBank
      // wallet — never the bot's operating wallet. No wallet, or an underfunded
      // one, means the buy is skipped and only the launch goes through.
      devBuyer: await creatorDevBuyer(request),
    });

    if (outcome.status === "CONFIRMED" && outcome.coinType && outcome.poolId) {
      deployment = { tokenAddress: outcome.coinType, transactionDigest: outcome.digest ?? "" };
      perpsPoolId = outcome.poolId;
      devBuyNotice = outcome.devBuyError ?? null;
    } else {
      failure = outcome.error ?? "The Perpsplexity curve did not confirm on chain.";
    }
  } else {
    const result = await launchpadAdapter.launchToken(launchConfigFor(request));
    const adapterDeployment = result.data?.["deployment"] as
      | { tokenAddress: string; transactionDigest: string }
      | undefined;
    if (result.status === "CONFIRMED" && adapterDeployment?.tokenAddress) deployment = adapterDeployment;
  }

  if (!deployment?.tokenAddress) {
    // Nothing on chain happened: park the request, say so plainly, keep it launchable later.
    const notice = failure ?? INTEGRATION_PENDING;
    await client
      .from("x_launch_requests")
      .update({ status: "UNAVAILABLE", notice, updated_at: new Date().toISOString() })
      .eq("id", request.id);
    return { status: "UNAVAILABLE", notice, tokenUrl: null, poolUrl: null };
  }

  const isPerps = pad.id === "perpsplexity";
  const isMaelstrom = pad.id === "maelstrom";
  // Maelstrom has its own token page, and its pools are Cetus pools that
  // Dexscreener charts — so both links stay on the pad's own surfaces.
  const { maelstromCoinUrl, dexscreenerPoolUrl } = await import("./maelstrom");
  const tokenUrl = isMaelstrom
    ? maelstromCoinUrl(deployment.tokenAddress)
    : isPerps
      ? `https://suiscan.xyz/mainnet/coin/${deployment.tokenAddress}`
      : tokenPageUrl(pad, deployment.tokenAddress);
  const poolUrl = isMaelstrom
    ? maelstromPoolId
      ? dexscreenerPoolUrl(maelstromPoolId)
      : pad.site
    : isPerps
      ? perpsPoolId
        ? `${pad.site}/pool/${perpsPoolId}`
        : pad.site
      : poolPageUrl(pad, deployment.tokenAddress);

  // This is only reported after the composite_pool::Created event confirms the
  // market-backed curve on chain.
  const positionLine = isPerps && request.underlying
    ? `Bonding curve · ${request.underlying.toUpperCase()} ${request.perps_long === false ? "SHORT" : "LONG"} ${
        (request.leverage_bps ?? 10_000) / 10_000
      }x`
    : null;
  await client
    .from("x_launch_requests")
    .update({
      status: "DEPLOYED",
      token_address: deployment.tokenAddress,
      pool_object_id: blastPoolObjectId ?? maelstromPoolId,
      token_url: tokenUrl,
      pool_url: poolUrl,
      tx_digest: deployment.transactionDigest,
      notice: devBuyNotice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  // Launcher share: for every Suipump launch reply, include a claim/verification
  // link for the exact X handle that owns the 70% share. If their wallet was
  // known at launch, this simply verifies/remembers the route; if not, it is how
  // they claim the parked share. Nobody has to ask for the link separately.
  // Perpsplexity routes creator fees through its own pool (pay_creator), so
  // there is no launch-time payee split to claim there.
  // Maelstrom pays LP fees on chain to one recipient set at launch, so there is
  // no OurBlast payee split to claim there either.
  const claimToken = isPerps || isMaelstrom ? null : await ensureFeeClaimLink(request.symbol, feeReceiverHandle(request));


  await postDeployedReply(request, tokenUrl, poolUrl, claimToken, positionLine);
  return { status: "DEPLOYED", notice: devBuyNotice, tokenUrl, poolUrl };
}

/**
 * Launch-by-hand confirmation for Suipump: the person creates the token on
 * suipump.org, we read the public Suipump feed and only mark the request
 * deployed when a matching curve really exists on chain.
 */
export async function confirmSuipumpLaunch(requestId: string): Promise<LaunchOutcome> {
  const client = await db();
  const { data: row } = await client.from("x_launch_requests").select("*").eq("id", requestId).maybeSingle();
  if (!row) throw new Error("That launch request no longer exists.");
  const request = row as LaunchRequestRow;
  if (request.status === "DEPLOYED") {
    return { status: "DEPLOYED", notice: null, tokenUrl: request.token_url, poolUrl: request.pool_url };
  }

  const pad = resolveLaunchpad(request.launchpad);
  if (pad.id !== "suipump") {
    return { status: request.status, notice: INTEGRATION_PENDING, tokenUrl: null, poolUrl: null };
  }

  const { findSuipumpLaunch } = await import("./suipump.server");
  // Allow a little clock slack either side of when the tweet landed.
  const since = new Date(request.created_at).getTime() - 15 * 60_000;
  const found = await findSuipumpLaunch(request.symbol, since);
  if (!found) {
    const notice = `No $${request.symbol} token found on Suipump yet. Create it, then check again.`;
    await client
      .from("x_launch_requests")
      .update({ notice, updated_at: new Date().toISOString() })
      .eq("id", request.id);
    return { status: request.status, notice, tokenUrl: null, poolUrl: null };
  }

  const poolUrl = found.poolState === "live" ? found.tokenPage : null;
  await client
    .from("x_launch_requests")
    .update({
      status: "DEPLOYED",
      token_address: found.curveId,
      token_url: found.tokenPage,
      pool_url: poolUrl,
      notice: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  const claimToken = await ensureFeeClaimLink(request.symbol, feeReceiverHandle(request));
  await postDeployedReply(request, found.tokenPage, poolUrl ?? found.tokenPage, claimToken);
  return { status: "DEPLOYED", notice: null, tokenUrl: found.tokenPage, poolUrl };
}

/** Reply sent the moment a mention is understood — explicitly not a deployment. */
export function composeReceivedReply(request: DeployRequest): string {
  return `⚠️ $${request.symbol} launch request received.\n\nOpen OurBlast Terminal to launch it.\nhttps://ourblast.xyz/terminal`;
}

/** Reply sent only after the chain has confirmed the launch. */
export function composeDeployedLaunchReply(
  symbol: string,
  tokenUrl: string,
  poolUrl: string,
  claimToken?: string | null,
  positionLine?: string | null,
  /** Set when the caller handed the creator fees to someone else. */
  designatedHandle?: string | null,
): string {
  const position = positionLine ? `\n${positionLine}\n` : "";
  // Exactly one $cashtag per reply — X rejects posts that carry more.
  const base = `🚀 $${symbol} LIVE\n${position}\nToken:\n${tokenUrl}\n\nPool:\n${poolUrl}`;
  const designation = designatedHandle ? `\n\nCreator fees designated to @${designatedHandle}.` : "";
  if (!claimToken) return `${base}${designation}`;
  const who = designatedHandle ? `Creator fee share for @${designatedHandle}` : "Your creator fee share";
  return `${base}${designation}\n\n${who}:\nhttps://ourblast.xyz/claim/${claimToken}`;
}

async function postDeployedReply(
  request: LaunchRequestRow,
  tokenUrl: string,
  poolUrl: string,
  claimToken?: string | null,
  positionLine?: string | null,
): Promise<void> {
  const { postReply, readXCredentials } = await import("./x-api.server");
  const credentials = readXCredentials();
  if (!credentials || request.x_post_id.startsWith("sim-")) return;
  try {
    const replyId = await postReply(
      credentials,
      request.x_post_id,
      composeDeployedLaunchReply(
        request.symbol,
        tokenUrl,
        poolUrl,
        claimToken,
        positionLine,
        request.fee_receiver_x_username,
      ),
    );
    const client = await db();
    await client.from("x_launch_requests").update({ deployed_reply_post_id: replyId }).eq("id", request.id);
  } catch (error) {
    console.error(`Deployed reply failed for ${request.symbol}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
