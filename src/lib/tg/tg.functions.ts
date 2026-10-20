// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { verifyInitData } from "./initData";

async function authed(initData: string) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Telegram is not configured");
  const user = await verifyInitData(initData, token);
  if (!user) throw new Error("Open this inside Telegram");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { user, db: supabaseAdmin };
}

export const tgSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    await db.from("tg_users").upsert({
      tg_user_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name ?? null,
      photo_url: user.photo_url ?? null,
      last_seen_at: new Date().toISOString(),
    });
    const { data: watch } = await db.from("tg_watchlist").select("launch_id").eq("tg_user_id", user.id);
    const { data: row } = await db.from("tg_users").select("x_username").eq("tg_user_id", user.id).maybeSingle();
    return {
      name: user.first_name ?? user.username ?? "friend",
      username: user.username ?? null,
      xUsername: row?.x_username ?? null,
      privyAppId: process.env["PRIVY_APP_ID"] ?? null,
      watchlist: (watch ?? []).map((w) => w.launch_id),
    };
  });

export const tgToggleWatch = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), launchId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    const { data: existing } = await db.from("tg_watchlist").select("id").eq("tg_user_id", user.id).eq("launch_id", data.launchId).maybeSingle();
    if (existing) {
      await db.from("tg_watchlist").delete().eq("id", existing.id);
      return { watching: false };
    }
    await db.from("tg_watchlist").insert({ tg_user_id: user.id, launch_id: data.launchId });
    return { watching: true };
  });

/** Links the X account verified by Privy to this Telegram user. */
export const tgLinkX = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), privyToken: z.string().min(20).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    const appId = process.env["PRIVY_APP_ID"];
    const secret = process.env["PRIVY_APP_SECRET"];
    if (!appId || !secret) throw new Error("Privy is not configured");
    const { verifiedXFromPrivy } = await import("./privy.server");
    const { did, xUsername } = await verifiedXFromPrivy(data.privyToken, appId, secret);
    if (!xUsername) throw new Error("No X account on that sign-in");
    await db.from("tg_users").update({ x_username: xUsername, privy_user_id: did }).eq("tg_user_id", user.id);
    return { xUsername };
  });

export const tgUnlinkX = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const { user, db } = await authed(data.initData);
    await db.from("tg_users").update({ x_username: null, privy_user_id: null }).eq("tg_user_id", user.id);
    return { ok: true };
  });
