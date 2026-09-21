import { BOT_WALLET_ADDRESS, DEFAULT_TREASURY_ADDRESS, FOUNDER_ADDRESS } from "@/lib/ourblast.config";
import { CREATOR_FEE_SPLIT } from "./fees";
import { poolPageUrl, resolveLaunchpad, tokenPageUrl } from "./launchpad";
import { launchpadAdapter } from "./launchpadAdapter";
import {
  DEFAULT_LAUNCHER_SETTINGS,
  parseDeployTweet,
  type DeployRequest,
  type LauncherSettings,
  type LaunchRequestStatus,
} from "./xLauncher";
import type { LaunchConfiguration } from "./types";

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
  /** Perpsplexity market-backed launch fields (null for plain launches). */
  underlying: string | null;
  perps_long: boolean | null;
  leverage_bps: number | null;
  starting_cap_usd: number | null;
  created_at: string;
}

const INTEGRATION_PENDING = "Launchpad integration coming soon.";

/**
 * On-chain creator-fee routing. The published split — 20% OURBLAST treasury,
 * 10% developer, 70% launcher — is written straight into the bonding curve, so
 * the launchpad pays every share automatically, with no manual claiming.
 *
 * When we know the launcher's wallet (their X account is linked to an OURBLAST
 * profile) their 70% goes to that wallet on chain. Otherwise the treasury holds
 * it and a claim link is created for their X handle. SUIPUMP_FEE_PAYEES still
 * overrides everything with equal shares.
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

async function feeRouting(xUsername: string): Promise<FeeRouting> {
  const configured = overridePayees();
  if (configured.length > 0) {
    const even = Math.floor(10_000 / configured.length);
    return {
      payees: configured,
      shareBps: configured.map((_, index) => (index === 0 ? 10_000 - even * (configured.length - 1) : even)),
      launcherPaidOnChain: false,
    };
  }

  // The bot wallet receives both OURBLAST shares (20% total): 10% funds ops
  // and gas, 10% is swapped to BLAST and burned from the same wallet.
  const bot = (process.env['OURBLAST_BOT_WALLET_ADDRESS']?.trim() || BOT_WALLET_ADDRESS).toLowerCase();
  const developer = FOUNDER_ADDRESS.toLowerCase();
  const launcher = await launcherWallet(xUsername);
  const botShareBps = toBps(CREATOR_FEE_SPLIT.bot + CREATOR_FEE_SPLIT.buyBurn);
  if (launcher && launcher !== bot && launcher !== developer) {
    return {
      payees: [bot, developer, launcher],
      shareBps: [botShareBps, toBps(CREATOR_FEE_SPLIT.developer), toBps(CREATOR_FEE_SPLIT.launcher)],
      launcherPaidOnChain: true,
    };
  }

  // No known launcher wallet: the bot wallet holds their share until they claim it.
  return {
    payees: [bot, developer],
    shareBps: [botShareBps + toBps(CREATOR_FEE_SPLIT.launcher), toBps(CREATOR_FEE_SPLIT.developer)],
    launcherPaidOnChain: false,
  };
}

/** Auto-creates the one-time claim link for a launcher whose wallet we don't know. */
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
      underlying: request.perps?.underlying ?? null,
      perps_long: request.perps ? request.perps.long : null,
      leverage_bps: request.perps?.leverageBps ?? null,
      starting_cap_usd: request.perps?.startingCapUsd ?? null,
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
    pairToken: pad.pairTokens[0] ?? "SUI",
    liquidity: pad.liquidity.default,
    // Developer buying stays off unless an operator switches it on.
    devBuy: row.dev_buy ? pad.liquidity.min : 0,
    totalSupply: pad.supply.default,
    feePayout: { mode: "creator", wallet: null, xUsername: row.x_username },
  };
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
  const routing = await feeRouting(request.x_username);

  if (pad.id === "suipump") {
    // Real Suipump create call, signed by the OurBlastBot wallet. Stays inert
    // (NOT_IMPLEMENTED) until Suipump issues a launch ticket to that wallet.
    const { launchOnSuipump } = await import("./suipump-launch.server");
    const outcome = await launchOnSuipump({
      symbol: request.symbol,
      name: request.name,
      description: "",
      // The picture from the tweet becomes the coin's image metadata.
      iconUrl: request.icon_url ?? null,
      // The caller's X link goes into the coin's public info.
      callerXLink: request.x_username ? `https://x.com/${request.x_username}` : null,
      // The caller's original tweet is quoted in the coin's public info.
      callerTweetText: request.tweet_text ?? null,
      payees: routing.payees,
      shareBps: routing.shareBps,
    });
    if (outcome.status === "CONFIRMED" && outcome.tokenAddress) {
      deployment = { tokenAddress: outcome.tokenAddress, transactionDigest: outcome.transactionDigest ?? "" };
    } else if (outcome.status === "FAILED") {
      failure = outcome.message;
    }
  } else if (pad.id === "perpsplexity") {
    // Market-backed launch: token + composite pool + leveraged position, one
    // atomic on-chain flow, signed by the OurBlastBot wallet.
    if (!request.underlying) {
      failure = "Add the underlying market to the call, e.g. Underlying: NVDA.";
    } else {
      const { launchOnPerpsplexity } = await import("./perpsplexity-launch.server");
      const outcome = await launchOnPerpsplexity({
        symbol: request.symbol,
        name: request.name,
        description: request.tweet_text ?? "",
        iconUrl: request.icon_url ?? "",
        underlying: request.underlying,
        long: request.perps_long ?? true,
        leverageBps: request.leverage_bps ?? 10_000,
        startingCapUsd: request.starting_cap_usd ? Number(request.starting_cap_usd) : null,
      });
      if (outcome.status === "CONFIRMED" && outcome.coinType) {
        deployment = { tokenAddress: outcome.coinType, transactionDigest: outcome.digest ?? "" };
      } else {
        failure = outcome.error ?? "The Perpsplexity launch did not confirm on chain.";
      }
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

  const tokenUrl = tokenPageUrl(pad, deployment.tokenAddress);
  const poolUrl = poolPageUrl(pad, deployment.tokenAddress);
  await client
    .from("x_launch_requests")
    .update({
      status: "DEPLOYED",
      token_address: deployment.tokenAddress,
      token_url: tokenUrl,
      pool_url: poolUrl,
      tx_digest: deployment.transactionDigest,
      notice: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  // Launcher share: paid on chain when we know their wallet, otherwise a claim
  // link is created for them automatically — nobody has to ask for it.
  const claimToken = routing.launcherPaidOnChain ? null : await ensureFeeClaimLink(request.symbol, request.x_username);

  await postDeployedReply(request, tokenUrl, poolUrl, claimToken);
  return { status: "DEPLOYED", notice: null, tokenUrl, poolUrl };
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

  await postDeployedReply(request, found.tokenPage, poolUrl ?? found.tokenPage);
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
): string {
  const base = `🚀 $${symbol} deployed!\n\nToken:\n${tokenUrl}\n\nPool:\n${poolUrl}`;
  if (!claimToken) return base;
  return `${base}\n\nYour creator fee share:\nhttps://ourblast.xyz/claim/${claimToken}`;
}

async function postDeployedReply(
  request: LaunchRequestRow,
  tokenUrl: string,
  poolUrl: string,
  claimToken?: string | null,
): Promise<void> {
  const { postReply, readXCredentials } = await import("./x-api.server");
  const credentials = readXCredentials();
  if (!credentials || request.x_post_id.startsWith("sim-")) return;
  try {
    const replyId = await postReply(
      credentials,
      request.x_post_id,
      composeDeployedLaunchReply(request.symbol, tokenUrl, poolUrl, claimToken),
    );
    const client = await db();
    await client.from("x_launch_requests").update({ deployed_reply_post_id: replyId }).eq("id", request.id);
  } catch (error) {
    console.error(`Deployed reply failed for ${request.symbol}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
