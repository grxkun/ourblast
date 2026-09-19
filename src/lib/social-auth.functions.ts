import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Called right after a social sign-in (Google) lands back in the app. Creates
 * the player profile the first time, then does nothing on later visits.
 */
export const ensureSocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureProfileRow } = await import("./social-auth.server");

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const meta = (user?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const provider = (user?.user?.app_metadata?.["provider"] as string | undefined) ?? "google";
    if (provider !== "google") {
      // Wallet and X sign-ins create their own profile rows during login.
      return { ok: true, created: false };
    }

    const result = await ensureProfileRow(supabaseAdmin, context.userId, {
      provider: "google",
      socialId: (meta["sub"] as string | undefined) ?? context.userId,
      displayName: (meta["full_name"] as string | undefined) ?? (meta["name"] as string | undefined) ?? null,
      avatarUrl:
        (meta["avatar_url"] as string | undefined) ?? (meta["picture"] as string | undefined) ?? null,
      handle: null,
    });
    return { ok: true, created: result.created };
  });
