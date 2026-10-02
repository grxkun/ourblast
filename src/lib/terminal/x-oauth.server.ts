// SPDX-License-Identifier: BUSL-1.1
/**
 * X (Twitter) OAuth 2.0 with PKCE — server-only.
 *
 * Works with both a public client (client id only, per X's "Native App") and a
 * confidential client (client id + secret). Tokens are stored encrypted; the
 * browser never receives an X access token.
 */

import { randomBytes, createHash } from "node:crypto";

import { encryptConnectionKey, decryptConnectionKey } from "@/lib/connection-key.server";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";

/** Scopes we need: read the profile, post replies, and refresh without re-consent. */
export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

/** Canonical callback URL registered in the X developer app. */
export const X_OAUTH_CALLBACK_URL = "https://ourblast.xyz/oauth/x/return";

export interface XOAuthClient {
  clientId: string;
  clientSecret: string | null;
}

export function readXOAuthClient(): XOAuthClient | null {
  const clientId = process.env["X_CLIENT_ID"] ?? process.env["X_OAUTH_CLIENT_ID"];
  if (!clientId) return null;
  const clientSecret = process.env["X_CLIENT_SECRET"] ?? process.env["X_OAUTH_CLIENT_SECRET"] ?? null;
  return { clientId, clientSecret };
}

const base64url = (input: Buffer) => input.toString("base64url");

export function createPkcePair() {
  const codeVerifier = base64url(randomBytes(64));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function createState() {
  return base64url(randomBytes(24));
}

export function buildAuthorizeUrl(options: {
  client: XOAuthClient;
  state: string;
  codeChallenge: string;
  redirectUri: string;
}) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.client.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", X_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function tokenRequest(client: XOAuthClient, body: Record<string, string>): Promise<TokenResponse> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const payload = { ...body };
  if (client.clientSecret) {
    headers["authorization"] = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;
  } else {
    payload["client_id"] = client.clientId;
  }

  const response = await fetch(TOKEN_URL, { method: "POST", headers, body: new URLSearchParams(payload).toString() });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`X OAuth token request failed [${response.status}]: ${detail.slice(0, 400)}`);
    throw new Error("X did not complete the connection. Please try again.");
  }
  return (await response.json()) as TokenResponse;
}

export function exchangeCode(client: XOAuthClient, code: string, codeVerifier: string, redirectUri: string) {
  return tokenRequest(client, {
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
}

export function refreshTokens(client: XOAuthClient, refreshToken: string) {
  return tokenRequest(client, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revokeToken(client: XOAuthClient, token: string) {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const payload: Record<string, string> = { token, token_type_hint: "access_token" };
  if (client.clientSecret) {
    headers["authorization"] = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;
  } else {
    payload["client_id"] = client.clientId;
  }
  try {
    await fetch(REVOKE_URL, { method: "POST", headers, body: new URLSearchParams(payload).toString() });
  } catch (error) {
    console.error("X token revoke failed", error);
  }
}

export interface XProfile {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
}

export async function fetchXProfile(accessToken: string): Promise<XProfile> {
  const response = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`X profile lookup failed [${response.status}]: ${detail.slice(0, 300)}`);
    throw new Error("Could not read your X profile.");
  }
  const result = (await response.json()) as { data: XProfile };
  return result.data;
}

/* ------------------------------ storage ------------------------------ */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveOAuthState(input: {
  state: string;
  userId: string | null;
  codeVerifier: string;
  redirectUri: string;
  purpose?: "connect" | "login";
}) {
  const db = await admin();
  // Drop anything older than 15 minutes so the table stays tiny.
  await db.from("x_oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { error } = await db.from("x_oauth_states").insert({
    state: input.state,
    user_id: input.userId,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    purpose: input.purpose ?? "connect",
  });
  if (error) throw new Error("Could not start the X connection.");
}

async function takeState(state: string) {
  const db = await admin();
  const { data, error } = await db
    .from("x_oauth_states")
    .select("state, user_id, code_verifier, redirect_uri, purpose, created_at")
    .eq("state", state)
    .maybeSingle();
  if (error || !data) throw new Error("This X link expired. Please try again.");
  await db.from("x_oauth_states").delete().eq("state", state);
  if (Date.now() - new Date(data.created_at).getTime() > 15 * 60_000) {
    throw new Error("This X link expired. Please try again.");
  }
  return data;
}

export async function consumeOAuthState(state: string, userId: string) {
  const data = await takeState(state);
  if (data.purpose !== "connect") throw new Error("This X link is not a connection link.");
  if (data.user_id !== userId) throw new Error("This X connection belongs to another account.");
  return { codeVerifier: data.code_verifier, redirectUri: data.redirect_uri };
}

/** Sign-in handshake: no app session exists yet, so there is no user to match. */
export async function consumeLoginState(state: string) {
  const data = await takeState(state);
  if (data.purpose !== "login") throw new Error("This X link is not a sign-in link.");
  return { codeVerifier: data.code_verifier, redirectUri: data.redirect_uri };
}

export async function saveXAccount(userId: string, profile: XProfile, tokens: TokenResponse) {
  const db = await admin();
  const { error } = await db.from("x_accounts").upsert(
    {
      user_id: userId,
      x_user_id: profile.id,
      username: profile.username,
      display_name: profile.name ?? null,
      avatar_url: profile.profile_image_url ?? null,
      access_token_ciphertext: encryptConnectionKey(tokens.access_token),
      refresh_token_ciphertext: tokens.refresh_token ? encryptConnectionKey(tokens.refresh_token) : null,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Could not save your X connection.");
}

/** A valid access token for this user, refreshed when it is close to expiry. */
export async function loadXAccessToken(userId: string): Promise<string | null> {
  const client = readXOAuthClient();
  if (!client) return null;
  const db = await admin();
  const { data } = await db
    .from("x_accounts")
    .select("access_token_ciphertext, refresh_token_ciphertext, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const fresh = !expiresAt || expiresAt - Date.now() > 60_000;
  if (fresh) return decryptConnectionKey(data.access_token_ciphertext);
  if (!data.refresh_token_ciphertext) return null;

  const tokens = await refreshTokens(client, decryptConnectionKey(data.refresh_token_ciphertext));
  await db
    .from("x_accounts")
    .update({
      access_token_ciphertext: encryptConnectionKey(tokens.access_token),
      refresh_token_ciphertext: tokens.refresh_token
        ? encryptConnectionKey(tokens.refresh_token)
        : data.refresh_token_ciphertext,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return tokens.access_token;
}

export async function deleteXAccount(userId: string) {
  const client = readXOAuthClient();
  const db = await admin();
  const { data } = await db
    .from("x_accounts")
    .select("access_token_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (client && data?.access_token_ciphertext) {
    await revokeToken(client, decryptConnectionKey(data.access_token_ciphertext));
  }
  await db.from("x_accounts").delete().eq("user_id", userId);
}
