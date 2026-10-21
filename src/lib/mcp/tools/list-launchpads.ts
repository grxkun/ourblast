import { defineTool } from "@lovable.dev/mcp-js";

import { LAUNCHPADS } from "@/lib/terminal/launchpad";

export default defineTool({
  name: "list_launchpads",
  title: "List launchpads",
  description:
    "List the Sui launch platforms OurBlast can target and whether each one is integrated yet, with supply and liquidity ranges.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const launchpads = LAUNCHPADS.map((pad) => ({
      id: pad.id,
      label: pad.label,
      site: pad.site,
      network: pad.network,
      integrated: pad.integrated,
      version: pad.version,
      pairTokens: [...pad.pairTokens],
      liquidity: { min: pad.liquidity.min, max: pad.liquidity.max, default: pad.liquidity.default },
      supply: { min: pad.supply.min, max: pad.supply.max, default: pad.supply.default },
    }));

    const text = launchpads
      .map((pad) => `${pad.label} — ${pad.integrated ? "integrated" : "not integrated yet"} (${pad.site})`)
      .join("\n");

    return { content: [{ type: "text", text }], structuredContent: { launchpads } };
  },
});
