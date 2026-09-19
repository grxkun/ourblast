/**
 * Shared profile bootstrap for players who sign in with a social account
 * instead of a Sui wallet. Server-only.
 *
 * Social players get a normal OURBLAST profile with no wallet address; they can
 * connect a Sui wallet later for anything that needs to be signed or paid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type SocialProvider = "google" | "x";

export interface SocialIdentity {
  provider: SocialProvider;
  socialId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
}

type Admin = SupabaseClient<Database>;

export function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Makes sure the signed-in user has a profile row. Safe to call on every visit:
 * it only writes when something is missing.
 */
export async function ensureProfileRow(db: Admin, userId: string, identity: SocialIdentity) {
  const { data: existing } = await db
    .from("profiles")
    .select("id, is_banned, auth_provider")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.is_banned) throw new Error("This account is banned from OURBLAST.");
    return { created: false };
  }

  const { error } = await db.from("profiles").insert({
    id: userId,
    wallet_address: null,
    auth_provider: identity.provider,
    social_id: identity.socialId,
    display_name: identity.displayName ?? null,
    avatar_url: identity.avatarUrl ?? null,
    nickname: identity.handle ?? identity.displayName ?? null,
    avatar_seed: `${identity.provider}:${identity.socialId}`,
  });
  if (error) throw new Error("Could not create your player profile.");
  await db.from("user_roles").insert({ user_id: userId, role: "player" });

  const { grantAchievement } = await import("./points.server");
  await grantAchievement(db, userId, "early_blast");
  return { created: true };
}

/** Finds the player already attached to this social account, if any. */
export async function findProfileBySocial(db: Admin, provider: SocialProvider, socialId: string) {
  const { data } = await db
    .from("profiles")
    .select("id, is_banned")
    .eq("auth_provider", provider)
    .eq("social_id", socialId)
    .maybeSingle();
  return data;
}
