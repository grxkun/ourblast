# OURBLAST channel listener

The standalone Node 22+ listener checks new Blast.fun and Suipump launches, observed prices and curve milestones independently of X and trading. It never runs the snipe trigger. Run only after publishing the updated app. Do not run against the preview for testing: it can post publicly.

Set `OURBLAST_INDEXER_ORIGIN=https://ourblast.xyz` and the same existing `SUI_INDEXER_SECRET` used by the indexer. Keep these in a private environment file, not the repository. Start `node scripts/ourblast-notifier.mjs` with automatic restart under your VPS supervisor. This is a separate process from the existing indexer; both can run together.

Example systemd service (set the actual installation paths):

```ini
[Unit]
Description=OURBLAST channel market listener
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ourblast
WorkingDirectory=/opt/ourblast
EnvironmentFile=/etc/ourblast/notifier.env
ExecStart=/usr/bin/node /opt/ourblast/scripts/ourblast-notifier.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Checks run sequentially, waiting 15 seconds after completion (up to 5,760 requests/day), with backoff to two minutes on failures. Frequent reads increase Cloud usage. Twelve rotating tokens are observed per check; detection time increases with token count and provider latency. The existing minute poll is a fallback, not a guarantee of instant delivery. No process needs to run inside the website, and closing the app does not stop a supervised listener.

Rules:
- Track verified new launches since listener activation, not historical milestone backfills.
- Price surge: at least +20% observed USD price over 15 minutes, a baseline within two minutes of the target, same curve/DEX stage, at most one alert per token per hour.
- 50% curve: once per exact coin type, when observed progress crosses from below 50%; initial already-above-threshold readings are baselines.
- Migration: once per coin after previously observing its state. Blast requires `Migrated`, never `MigrationReady`; Suipump requires graduation and a recorded, on-chain verified pool containing the exact coin.
- Trends: one summary per four-hour UTC bucket, top five positive observed four-hour price gains with fresh readings and complete baseline coverage. No invented volume, no ranking by newness. First results need four hours of history; tokens with missing data are excluded.
- Images, current scan/deployer details and available socials accompany individual alerts. Missing socials remain unavailable.
- A database lease prevents concurrent processing; durable per-signal claims prevent duplicate public posts. Ambiguous sends are not replayed automatically. Listener completion/error timestamps are saved privately for health checks.

Installation and production activation require VPS access and publishing. Never start this listener during debugging without authorization to send public posts.