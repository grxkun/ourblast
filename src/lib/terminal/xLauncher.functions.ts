import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_LAUNCHER_SETTINGS, type LauncherSettings } from "./xLauncher";

/** Public: the four simple launcher settings. */
export const getLauncherSettings = createServerFn({ method: "GET" }).handler(async (): Promise<LauncherSettings> => {
  const { readLauncherSettings } = await import("./xLauncher.server");
  try {
    return await readLauncherSettings();
  } catch {
    return DEFAULT_LAUNCHER_SETTINGS;
  }
});

const settingsSchema = z.object({
  defaultLaunchpad: z.string().min(2).max(40),
  ourblastFeePercent: z.number().min(0).max(50),
  devBuyEnabled: z.boolean(),
  autoLaunchEnabled: z.boolean(),
});

/** Admin only: change the default launchpad, fee, developer buy and automatic launch. */
export const saveLauncherSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = ((roles ?? []) as { role: string }[]).some((row) => row.role === "admin");
    if (!isAdmin) throw new Error("Admins only.");
    const { writeLauncherSettings } = await import("./xLauncher.server");
    return writeLauncherSettings(data);
  });

/** Signed-in users press LAUNCH; the OurBlast wallet does the work on the backend. */
export const launchXRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { executeLaunchRequest } = await import("./xLauncher.server");
    return executeLaunchRequest(data.requestId);
  });
