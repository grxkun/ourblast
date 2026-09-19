import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The callback X redirects to. Registered in the X developer app. */
function callbackUrl() {
  const request = getRequest();
  const configured = process.env["X_CALLBACK_URL"];
  const fallback = configured ?? "https://ourblast.xyz/oauth/x/return";
  if (!request) return fallback;
  const url = new URL(request.url);
  // Keep localhost working for development; everything else uses the public origin.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return new URL("/oauth/x/return", url.origin).toString();
  }
  // Always use the registered public callback: X rejects any redirect_uri
  // that is not listed in the app settings, so the preview origin would fail.
  return fallback;
}

export const getXConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readXOAuthClient } = await import("./x-oauth.server");
    const configured = readXOAuthClient() !== null;
    const { data } = await context.supabase
      .from("x_accounts")
      .select("username, display_name, avatar_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      configured,
      account: data
        ? {
            username: data.username,
            displayName: data.display_name ?? undefined,
            avatarUrl: data.avatar_url ?? undefined,
          }
        : null,
    };
  });

export const startXConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readXOAuthClient, createPkcePair, createState, buildAuthorizeUrl, saveOAuthState } = await import(
      "./x-oauth.server"
    );
    const client = readXOAuthClient();
    if (!client) throw new Error("X connection is not configured yet.");

    const redirectUri = callbackUrl();
    const state = createState();
    const { codeVerifier, codeChallenge } = createPkcePair();
    await saveOAuthState({ state, userId: context.userId, codeVerifier, redirectUri });

    return { authorizationUrl: buildAuthorizeUrl({ client, state, codeChallenge, redirectUri }) };
  });

export const completeXConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().min(8).max(2048), state: z.string().min(8).max(512) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { readXOAuthClient, consumeOAuthState, exchangeCode, fetchXProfile, saveXAccount } = await import(
      "./x-oauth.server"
    );
    const client = readXOAuthClient();
    if (!client) throw new Error("X connection is not configured yet.");

    const { codeVerifier, redirectUri } = await consumeOAuthState(data.state, context.userId);
    const tokens = await exchangeCode(client, data.code, codeVerifier, redirectUri);
    const profile = await fetchXProfile(tokens.access_token);
    await saveXAccount(context.userId, profile, tokens);

    return {
      account: {
        username: profile.username,
        displayName: profile.name ?? undefined,
        avatarUrl: profile.profile_image_url ?? undefined,
      },
    };
  });

export const disconnectXAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteXAccount } = await import("./x-oauth.server");
    await deleteXAccount(context.userId);
    return { ok: true };
  });
