import { createFileRoute } from "@tanstack/react-router";

/**
 * Temporary operator endpoint used to run one real Perpsplexity test launch.
 * Guarded by PERPS_TEST_TOKEN; delete this file after the test.
 */
export const Route = createFileRoute("/api/public/perps-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env['PERPS_TEST_TOKEN']?.trim();
        if (!token || request.headers.get("x-perps-test") !== token) {
          return new Response("Forbidden", { status: 403 });
        }
        const body = (await request.json()) as {
          check?: boolean;
          symbol?: string;
          name?: string;
          underlying?: string;
          long?: boolean;
          leverageBps?: number;
          startingCapUsd?: number | null;
        };

        if (body.check) {
          return Response.json({
            hasBotKey: Boolean(process.env['OURBLASTBOT_SUI_SECRET_KEY']),
          });
        }

        const { launchOnPerpsplexity } = await import("@/lib/terminal/perpsplexity-launch.server");
        try {
          const outcome = await launchOnPerpsplexity({
            symbol: String(body.symbol ?? ""),
            name: String(body.name ?? ""),
            description: "",
            iconUrl: "",
            underlying: String(body.underlying ?? ""),
            long: body.long ?? true,
            leverageBps: body.leverageBps ?? 50_000,
            startingCapUsd: body.startingCapUsd ?? null,
          });
          return Response.json(outcome);
        } catch (error) {
          return Response.json({
            status: "FAILED",
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      },
    },
  },
});
