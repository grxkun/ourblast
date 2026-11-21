# Optional Sui market indexer

This Node 22+ daemon fills the public Discover catalog from official Sui GraphQL events, including historical Suipump V17/V18, Blast.fun, Popular and Perpsplexity launches. It never signs, submits trades, sends Telegram messages or changes auto-snipe cursors.

The initial catalog is usable without a VPS. The VPS keeps the launch catalog updating continuously; it cannot remove the official chain service's own indexing delay. DEX prices are fetched separately in the app with a 45-second cache; missing pool prices are also checked with Aftermath. A missing price or market cap remains unavailable, not zero. Market cap is not replaced with FDV. Catalog inclusion is not a token safety endorsement.

## Setup after publishing

1. Choose a random secret of at least 32 characters; save the same value as `SUI_INDEXER_SECRET` in Lovable Cloud and your VPS environment. Never commit it. The existing internal cron secret is only for internal checks; do not copy it to the VPS.
2. Set `OURBLAST_INDEXER_ORIGIN=https://ourblast.xyz` and optionally `INDEXER_STATE_PATH` to an absolute writable file path.
3. Run `node scripts/sui-market-indexer.mjs` under your existing process supervisor, with automatic restart.

The daemon backfills 25 events per request, preserving a local cursor only after the batch is saved. Then it checks each source in sequence, paging backwards to its last successfully indexed timestamp to catch up after downtime or launch bursts. It waits two seconds between sources (at least ten seconds per cycle, plus read latency). Duplicate types are upserted, so repeated events do not create duplicate rows. Failed pages retry without advancing. It uses HTTPS and does not log the secret.

## Limits

- This is a catalog indexer, not a sub-second trading engine; auto-sniping retains its separate confirmation, freshness and duplicate-buy protection.
- Metadata is read on-chain; unavailable/deleted curve objects may not yield a token type.
- Event types follow the defining package lineage. Add a verified new lineage when launchpads upgrade; do not guess event names or contracts.
- The daemon currently covers the verified V17/V18 Suipump lineages, not every retired deployment ever made.
- API requests can sync only the listed sources and pagination cursor. Arbitrary records, prices, or user data are not accepted.
- The app reads the latest 2,000 catalog entries. No claim of exhaustive ecosystem indexing is made.