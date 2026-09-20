import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SuipumpDeployerStatus } from "./suipump-launch";

/**
 * Admin-only readiness view for the Suipump adapter: which wallet would sign,
 * whether Suipump has issued a launch ticket to it, and what is still missing.
 */
export const getSuipumpDeployerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }: { context: any }): Promise<SuipumpDeployerStatus> => {
    const { data: staff } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((staff ?? []) as { role: string }[]).map((row) => row.role);
    if (!roles.includes("admin") && !roles.includes("moderator")) throw new Error("Staff only.");

    const { readDeployerStatus } = await import("./suipump-launch.server");
    return readDeployerStatus();
  });
