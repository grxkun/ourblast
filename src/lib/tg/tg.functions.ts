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
    return {
      name: user.first_name ?? user.username ?? "friend",
      username: user.username ?? null,
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
