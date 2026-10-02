// SPDX-License-Identifier: BUSL-1.1
import { defineMcp } from "@lovable.dev/mcp-js";

import getLaunchTool from "./tools/get-launch";
import leaderboardTool from "./tools/leaderboard";
import listLaunchesTool from "./tools/list-launches";
import listLaunchpadsTool from "./tools/list-launchpads";
import topBuildersTool from "./tools/top-builders";

export default defineMcp({
  name: "blast-memes-hub",
  title: "Blast Memes Hub",
  version: "0.1.0",
  instructions:
    "Public read-only tools for OurBlast, a Sui community arcade and builder hub. Use `list_launches` and `get_launch` for token launch calls picked up from X, `list_launchpads` for supported Sui launch platforms, `get_leaderboard` for the arcade leaderboard and `list_builders` for builder rankings. All data is the same information the public website shows; no wallets, keys or private user data are exposed.",
  tools: [listLaunchesTool, getLaunchTool, listLaunchpadsTool, leaderboardTool, topBuildersTool],
});
