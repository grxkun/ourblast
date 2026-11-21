// SPDX-License-Identifier: BUSL-1.1
import { z } from "zod";

export const tgLaunchInput = z.object({
  symbol: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,9}$/).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).default(""),
  launchpad: z.enum(["blastfun", "suipump"]),
  iconUrl: z.string().url().max(500).refine((v) => v.startsWith("https://"), "Use an HTTPS image URL."),
  slot: z.number().int().min(1).max(6),
  firstBuySui: z.number().finite().min(0).max(1000).default(0),
}).superRefine((d, ctx) => {
  if (d.launchpad === "blastfun" && d.firstBuySui > 0) ctx.addIssue({ code: "custom", path: ["firstBuySui"], message: "Blast.fun first buy is not available in this launch flow yet." });
});
export type TgLaunchInput = z.input<typeof tgLaunchInput>;