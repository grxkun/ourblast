# Blast Build — Phase 1 Foundation

## Goal
Add Blast Build as a new OURBLAST ecosystem product without replacing the existing `$BLAST` landing page or arcade. The first release turns verified public Sui repositories into a shareable builder profile and animated city.

## User flow
1. Open `/build` and connect the existing Sui wallet.
2. Connect GitHub with public-profile and public-repository access only.
3. Import and analyze public repositories on the server.
4. Show evidence and a 0–100 Sui relevance score for every repository.
5. Include only repositories scoring at least 60 in Builder Score and city generation.
6. Generate the city, connect each verified repository to a building, and publish a shareable `/builder/@username` profile.

## What will be built
- A polished Blast Build landing/dashboard at `/build`, using a restrained Sui blue/cyan developer-platform visual system.
- GitHub per-user OAuth attached to the signed-in Sui wallet identity; connection credentials stay encrypted on the server.
- Server-authoritative GitHub ingestion for profile, public repositories, topics, languages, repository tree, selected dependency files, activity, pull requests, issues, contributors, and stars.
- A configurable Sui Relevance Engine with strong, medium, and weak evidence. Weak signals alone never verify a project.
- Anti-gaming rules for forks, duplicated repositories, suspicious commit bursts, stale projects, and star dominance.
- Transparent Builder Score breakdown and repository-level evidence.
- Modular repository-to-building classification for DApp, Move, NFT, DeFi, gaming, infrastructure, tooling, automation, social, meme, and wallet projects.
- An animated isometric-style city with Builder HQ, districts, building levels, selectable buildings, and reduced-motion support.
- A public builder profile with city, score, verified projects, activity history, wallet status, and share actions.
- Navigation links from the OURBLAST utility area while preserving `/`, `/hub`, and the existing arcade.

## Data and security
- Add separate tables for encrypted GitHub connection handles, builders, repositories, verification evidence, activity snapshots, cities, districts, and buildings.
- Keep GitHub source data, derived verification, builder identity, city state, and blockchain identity logically separate.
- Public visitors may read only published builder/city fields. Owners may manage their own profile. Provider credentials and raw private data are never browser-readable.
- All scoring and ingestion run server-side. GitHub rate-limit and reconnect states are surfaced clearly.
- BLAST token type, Sui network, treasury address, relevance threshold, score weights, building categories, and city tiers use central configuration. No token address will be invented.

## Phase boundary
This implementation covers Phase 1 only: identity, repository verification, scoring, initial city, wallet status, BLAST balance when configured, and public profiles. It prepares but does not activate BLAST deposits, construction transactions, paid upgrades, global rankings, or the world map.

## Validation
- Verify GitHub connect, callback, encrypted credential storage, import, scoring, and reconnect behavior.
- Verify a repository cannot pass from weak keywords alone.
- Verify `/build` and public profiles across desktop and mobile, including city interaction and reduced motion.
- Verify existing landing, hub, arcade, chat, and wallet flows remain unchanged.
