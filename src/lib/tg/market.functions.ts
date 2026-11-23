// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

export type { MarketSort, MarketRow } from "./market";
/** Public market data only; loading the board never creates wallets or starts trades. */
export const tgMarket = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sort: z.enum(["trending", "new", "volume", "main"]) }))
  .handler(async ({ data }) => {
    const { loadMarket } = await import("./market.server");
    const request = getRequest() as Request & { waitUntil?: (work: Promise<unknown>) => void };
    return loadMarket(data.sort, request.waitUntil?.bind(request));
  });

export const tgTokenDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ coinType: z.string().min(10).max(300) }))
  .handler(async ({ data }) => {
    const { loadTokenDetail } = await import("./tokenDetail.server");
    return loadTokenDetail(data.coinType);
  });
