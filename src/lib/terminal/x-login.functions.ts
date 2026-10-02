// SPDX-License-Identifier: BUSL-1.1
/**
 * Sign in to OURBLAST with an X account.
 *
 * Same OAuth 2.0 PKCE app as the "connect X" flow, but with no app session yet:
 * the handshake is stored with purpose "login", and once X confirms the account
 * we hand the browser one-time credentials for its own session — exactly like
 * the wallet login does. No X token ever reaches the browser.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

function callbackUrl() {
  const request = getRequest();
  const fallback = process.env["X_CALLBACK_URL"] ?? "https://ourblast.xyz/oauth/x/return";
  if (!request) return fallback;
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return new URL("/oauth/x/return", url.origin).toString();
  }
  return fallback;
}

function loginEmail(xUserId: string) {
  return `x${xUserId}@x.ourblast.xyz`;
}

export const startXLogin = createServerFn({ method: "POST" }).handler(async () => {
  const { readXOAuthClient, createPkcePair, createState, buildAuthorizeUrl, saveOAuthState } = await import(
    "./x-oauth.server"
  );
  const client = readXOAuthClient();
  if (!client) throw new Error("X sign-in is not configured yet.");

  const redirectUri = callbackUrl();
  const state = createState();
  const { codeVerifier, codeChallenge } = createPkcePair();
  await saveOAuthState({ state, userId: null, codeVerifier, redirectUri, purpose: "login" });

  return { authorizationUrl: buildAuthorizeUrl({ client, state, codeChallenge, redirectUri }) };
});

export const completeXLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ code: z.string().min(8).max(2048), state: z.string().min(8).max(512) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { readXOAuthClient, consumeLoginState, exchangeCode, fetchXProfile, saveXAccount } = await import(
      "./x-oauth.server"
    );
    const client = readXOAuthClient();
    if (!client) throw new Error("X sign-in is not configured yet.");

    const { codeVerifier, redirectUri } = await consumeLoginState(data.state);
    const tokens = await exchangeCode(client, data.code, codeVerifier, redirectUri);
    const xProfile = await fetchXProfile(tokens.access_token);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureProfileRow, findProfileBySocial, randomPassword } = await import("@/lib/social-auth.server");

    const email = loginEmail(xProfile.id);
    const password = randomPassword();
    const existing = await findProfileBySocial(supabaseAdmin, "x", xProfile.id);

    let userId = existing?.id;
    let isNew = false;

    if (userId) {
      if (existing?.is_banned) throw new Error("This account is banned from OURBLAST.");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error("Could not open a session for this X account.");
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { x_username: xProfile.username },
      });
      if (error || !created.user) throw new Error("Could not register this X account.");
      userId = created.user.id;
      isNew = true;
    }

    await ensureProfileRow(supabaseAdmin, userId, {
      provider: "x",
      socialId: xProfile.id,
      displayName: xProfile.name ?? null,
      avatarUrl: xProfile.profile_image_url ?? null,
      handle: xProfile.username,
    });

    // The same grant also powers @ourblastbot replies for this player.
    await saveXAccount(userId, xProfile, tokens);

    return { email, password, username: xProfile.username, isNew };
  });
