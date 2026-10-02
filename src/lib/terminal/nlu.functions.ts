// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Rewrites a message the parser could not read into a canonical terminal command.
 * Public on purpose: the terminal itself is public, and the result is still run
 * through the same allowlisted parser before anything happens.
 */
export const interpretCommand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ text: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const { interpretFreeText } = await import("./nlu.server");
    return { command: await interpretFreeText(data.text) };
  });

/**
 * Conversational fallback for terminal messages that are not commands at all.
 * Public on purpose: it only returns text — it never touches wallets or chain.
 */
export const chatCommand = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ text: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const { chatFreeText } = await import("./nlu.server");
    return { reply: await chatFreeText(data.text) };
  });
