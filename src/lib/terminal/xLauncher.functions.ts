// SPDX-License-Identifier: BUSL-1.1
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
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Only OURBLAST staff can run queued launches.");
    const { executeLaunchRequest } = await import("./xLauncher.server");
    return executeLaunchRequest(data.requestId);
  });

const terminalLaunchSchema = z.object({
  symbol: z.string().min(1).max(10),
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(""),
  launchpad: z.string().min(2).max(40),
  iconUrl: z.string().max(500).nullable().default(null),
  startingCapUsd: z.number().positive().max(10_000_000).nullable().default(null),
  underlying: z.string().max(40).nullable().default(null),
  long: z.boolean().default(true),
  leverageBps: z.number().int().min(10_000).max(100_000).nullable().default(null),
  devBuyUsdc: z.number().min(0).max(100_000).nullable().default(null),
  devBuySui: z.number().min(0).max(100_000).nullable().default(null),
  pairToken: z.string().regex(/^[A-Za-z0-9]{2,10}$/).nullable().default(null),
  feeWallet: z.string().regex(/^0x[a-fA-F0-9]{40,64}$/).nullable().default(null),
  feeX: z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/).nullable().default(null),
});

/**
 * LAUNCH from the terminal. It reuses exactly the X launch pipeline: a launch
 * request row, then the same executor — so one press can only ever produce one
 * launch, and the result is reported from the confirmed chain state.
 */
export const launchFromTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => terminalLaunchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { createLaunchRequest, executeLaunchRequest } = await import("./xLauncher.server");
    const { data: account } = await context.supabase
      .from("x_accounts")
      .select("username")
      .eq("user_id", context.userId)
      .maybeSingle();
    const username = (account as { username?: string } | null)?.username ?? "terminal";
    // A stable id per user + token + minute: a double press re-uses the same
    // request row instead of launching the token twice.
    const bucket = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const postId = `terminal-${context.userId}-${data.symbol.toUpperCase()}-${bucket}`;
    const feeReceiver = data.feeWallet
      ? { wallet: data.feeWallet }
      : data.feeX ? { handle: data.feeX.replace(/^@/, "") } : undefined;
    // The executor reads the LP pair and description from the stored text, the
    // same way it does for a post, so the card's choices are written in that form.
    const storedText = [
      data.pairToken ? `paired with $${data.pairToken.toUpperCase()}` : "",
      data.description ? `Desc: ${data.description}` : "",
    ].filter(Boolean).join("\n");
    const row = await createLaunchRequest(
      postId,
      username,
      {
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        launchpad: data.launchpad,
        perps: data.startingCapUsd || data.underlying
          ? {
              underlying: data.underlying,
              long: data.long,
              leverageBps: data.leverageBps ?? 30_000,
              startingCapUsd: data.startingCapUsd,
            }
          : undefined,
        devBuyUsdc: data.devBuyUsdc ?? undefined,
        devBuySui: data.devBuySui ?? undefined,
        feeReceiver,
      },
      data.iconUrl,
      storedText || null,
    );
    if (row.status === "DEPLOYED") {
      return { status: "DEPLOYED" as const, notice: "That token was already launched.", tokenUrl: row.token_url, poolUrl: row.pool_url };
    }
    return executeLaunchRequest(row.id);
  });
