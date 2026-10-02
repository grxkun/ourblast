// SPDX-License-Identifier: BUSL-1.1
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "list_builders",
  title: "List top builders",
  description:
    "List the top OurBlast builders ranked by builder score, with their GitHub handle, verified repositories, commits and Sui reputation.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many builders to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = supabaseAnon();
    const { data, error } = await supabase
      .from("builders")
      .select(
        "github_username, github_name, builder_score, builder_level, verified_repository_count, total_commits, merged_pull_requests, sui_reputation_score, verified_package_count, sui_verified",
      )
      .eq("is_public", true)
      .order("builder_score", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);

    const builders = (data ?? []).map((row, index) => ({
      rank: index + 1,
      githubUsername: row.github_username,
      name: row.github_name,
      builderScore: row.builder_score ?? 0,
      builderLevel: row.builder_level ?? null,
      verifiedRepositories: row.verified_repository_count ?? 0,
      commits: row.total_commits ?? 0,
      mergedPullRequests: row.merged_pull_requests ?? 0,
      suiReputationScore: row.sui_reputation_score ?? 0,
      verifiedPackages: row.verified_package_count ?? 0,
      suiVerified: row.sui_verified ?? false,
    }));

    const text = builders.length
      ? builders
          .map((b) => `${b.rank}. ${b.githubUsername ?? b.name ?? "unknown"} — score ${b.builderScore}`)
          .join("\n")
      : "No public builders yet.";

    return { content: [{ type: "text", text }], structuredContent: { builders } };
  },
});
