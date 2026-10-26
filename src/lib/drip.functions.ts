// SPDX-License-Identifier: BUSL-1.1
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type DripCollection = { type: string; slug: string | null; floorSui: number | null; url: string };

const cache = new Map<string, { at: number; v: DripCollection }>();
const TTL = 5 * 60_000;

async function lookup(type: string, name: string): Promise<DripCollection> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const struct = type.split("<")[0].split("::").pop() ?? "";
  const wanted = new Set([name.toLowerCase(), struct.toLowerCase()]);
  let v: DripCollection = { type, slug: null, floorSui: null, url: "https://drip.market/nfts" };
  for (const q of [...new Set([name, struct])].filter(Boolean)) {
    try {
      const res = await fetch(`https://drip.market/api/search?q=${encodeURIComponent(q)}`, {
        headers: { "user-agent": "ourblast/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const j = (await res.json().catch(() => ({}))) as { results?: { kind: string; href: string; title: string; subtitle?: string }[] };
      const r = j.results?.find((x) => x.kind === "collection" && wanted.has(x.title.toLowerCase()));
      if (r) {
        const f = r.subtitle?.match(/([\d.,]+)\s*SUI floor/i)?.[1];
        v = { type, slug: r.href.replace(/^\//, ""), floorSui: f ? Number(f.replace(/,/g, "")) : null, url: `https://drip.market${r.href}` };
        break;
      }
    } catch { /* drip unreachable: fall back to marketplace home */ }
  }
  cache.set(type, { at: Date.now(), v });
  return v;
}

/** Public, read-only: drip.market floor price + collection page for each NFT collection. */
export const getDripCollections = createServerFn({ method: "POST" })
  .inputValidator(z.object({ items: z.array(z.object({ type: z.string().max(300), name: z.string().max(120) })).max(30) }))
  .handler(async ({ data }) => Promise.all(data.items.map((i) => lookup(i.type, i.name))));
