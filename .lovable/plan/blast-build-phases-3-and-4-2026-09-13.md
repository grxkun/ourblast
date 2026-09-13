# Blast Build — Phases 3 and 4

## Goal
Extend the existing Builder City into a social Sui builder network and verified ecosystem layer without rebuilding Phases 1–2 or mixing reputation with BLAST spending.

## Phase 3 — Social

### Rankings and discovery
- Keep the existing separate Builder, City, BLAST, Rising, and Open Source boards.
- Add a dedicated Weekly board calculated only from the latest seven days of verified activity.
- Show clear metric explanations so Builder reputation and paid City growth cannot be confused.
- Upgrade the Builder Map into a responsive city atlas with stable, deterministic placement and links to every public city.

### Shareable cities
- Add a polished city share card containing username, city level, Builder Power, verified Sui projects, commits, packages, and the public city URL.
- Support native mobile sharing, copy-link fallback, and downloading the social card for X, Telegram, or Discord.
- Keep every public city useful and shareable at zero BLAST.

### Badges and achievements
- Expand visual Builder badges with distinct icons and evidence.
- Add achievement progress for repository, Move, open-source, activity, and package milestones.
- Display earned badges and progress on both the owner dashboard and public city profile.

## Phase 4 — Ecosystem

### Sui package verification
- Detect package IDs from strong GitHub evidence such as Move manifests, source, documentation, and deployment configuration.
- Verify every candidate against Sui mainnet server-side by confirming it is a real Move package and reading its modules/version/publication transaction.
- Detect packages from the connected wallet’s recent successful publish transactions and reconcile them with GitHub candidates.
- Never trust a client-submitted package ID or frontend success state; only verified on-chain evidence affects package counts.

### Sui Builder Reputation
- Add a separate, transparent Sui Reputation score based on verified repositories, verified packages, shipping activity, collaboration, and achievements.
- Keep Builder Power, Sui Reputation, City Power, and BLAST committed as separate visible values.
- Recalculate reputation and achievements only on the server after verified syncs.

### Ecosystem projects and global city
- Publish verified repositories into an Ecosystem Projects directory with category, builder, Sui relevance, package status, and reputation.
- Add a Community City assembled from verified public ecosystem projects and builders, with district filtering and links back to projects/cities.
- Use only verified project data; honorary Sui team cities remain clearly separate from app-verified rankings.

## Data and integrity
- Use the newly added package, ecosystem project, and builder achievement records as service-managed data with public read-only visibility following builder privacy.
- Preserve all existing access controls; no direct browser writes to scores, package verification, reputation, or achievements.
- Keep package verification separate from BLAST construction verification.
- Store no geographic location in the Builder Map.

## Routes and interface
- Extend `/builders` with weekly rankings, the improved atlas, badge gallery, and links into the ecosystem.
- Extend `/build` with package verification status, Sui Reputation, achievement progress, and share-card access.
- Extend `/builder/@username` with verified packages, reputation evidence, achievements, and downloadable sharing.
- Add `/ecosystem` for verified projects and `/community-city` for the global city, each with unique metadata and navigation.

## Validation
- Verify public and signed-in paths on desktop and mobile.
- Test real Sui package lookups, invalid/non-package IDs, deduplication, and wallet/repository reconciliation.
- Confirm weekly/rising rankings use only their intended time windows.
- Confirm zero-BLAST builders retain full social profiles, rankings, badges, projects, and sharing.
- Confirm no browser errors, broken links, horizontal overflow, or unauthorized data writes.
