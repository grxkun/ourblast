// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { MarketSort, MarketRow } from "./market";
/** Public market data only; loading the board never creates wallets or starts trades. */
export const tgMarket = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sort: z.enum(["trending", "new", "volume", "main"]) }))
  .handler(async ({ data }) => {
    const { loadMarket } = await import("./market.server");
    return loadMarket(data.sort);
  });

export const tgTokenDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ coinType: z.string().min(10).max(300) }))
  .handler(async ({ data }) => {
    const { loadTokenDetail } = await import("./tokenDetail.server");
    return loadTokenDetail(data.coinType);
  });
