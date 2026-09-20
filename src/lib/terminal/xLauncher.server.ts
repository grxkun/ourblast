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
  created_at: string;
}

const INTEGRATION_PENDING = "Launchpad integration coming soon.";

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
    image: null,
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

  const pad = resolveLaunchpad(request.launchpad);
  let deployment: { tokenAddress: string; transactionDigest: string } | undefined;
  let failure: string | null = null;

  if (pad.id === "suipump") {
    // Real Suipump create call, signed by the OurBlastBot wallet. Stays inert
    // (NOT_IMPLEMENTED) until Suipump issues a launch ticket to that wallet.
    const { launchOnSuipump } = await import("./suipump-launch.server");
    const outcome = await launchOnSuipump({
      symbol: request.symbol,
      name: request.name,
      description: "",
      payees: suipumpPayees(),
      shareBps: [10_000],
    });
    if (outcome.status === "CONFIRMED" && outcome.tokenAddress) {
      deployment = { tokenAddress: outcome.tokenAddress, transactionDigest: outcome.transactionDigest ?? "" };
    } else if (outcome.status === "FAILED") {
      failure = outcome.message;
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

  await postDeployedReply(request, tokenUrl, poolUrl);
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
export function composeDeployedLaunchReply(symbol: string, tokenUrl: string, poolUrl: string): string {
  return `🚀 $${symbol} deployed!\n\nToken:\n${tokenUrl}\n\nPool:\n${poolUrl}`;
}

async function postDeployedReply(request: LaunchRequestRow, tokenUrl: string, poolUrl: string): Promise<void> {
  const { postReply, readXCredentials } = await import("./x-api.server");
  const credentials = readXCredentials();
  if (!credentials || request.x_post_id.startsWith("sim-")) return;
  try {
    const replyId = await postReply(credentials, request.x_post_id, composeDeployedLaunchReply(request.symbol, tokenUrl, poolUrl));
    const client = await db();
    await client.from("x_launch_requests").update({ deployed_reply_post_id: replyId }).eq("id", request.id);
  } catch (error) {
    console.error(`Deployed reply failed for ${request.symbol}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
