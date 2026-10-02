# OurBlast

<p align="center">
  <img src="./assets/banner.png" alt="OurBlast" width="100%">
</p>

<p align="center">
  <strong>Onchain trading and launch infrastructure for Sui.</strong>
</p>

## Overview

OurBlast is an onchain application built on Sui, powering token launches, trading, wallet functionality, and social workflows through **OurBlastbot**.

## Features

* Onchain token launches
* Token discovery and trading
* Sui wallet integration
* Launchpad integrations
* OurBlastbot
* X / social integration
* Telegram workflows
* Creator fee infrastructure
* Onchain transaction execution

## Architecture

```text
                         OurBlast
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
          Web App       OurBlastbot      Social / X
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                    Sui Integration Layer
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
          Wallet       Transactions    Launchpads
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                       Sui Network
```

## Launchpads

OurBlast connects to multiple launchpads across the Sui ecosystem.

```text
                         Sui Network
                              │
                              ▼
                          Launchpads
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
          Launch            Trade            Liquidity
```

## Blast.fun

Blast.fun integration is implemented through the Sui transaction layer.

Primary implementation:

```text
src/lib/terminal/blastfun-launch.server.ts
```

## Repository Structure

```text
src/            Application and integration source
public/         Static assets
supabase/       Database and backend functions
package.json    Project dependencies
bun.lock        Dependency lockfile
LICENSE         BUSL-1.1 license
ARCHITECTURE.md Project architecture
```

## Development

Install dependencies:

```bash
bun install
```

Run development:

```bash
bun run dev
```

Build:

```bash
bun run build
```

## Environment

Production credentials must be supplied through environment variables.

Never commit:

```text
.env
.env.local
private keys
mnemonics
API keys
access tokens
service-role keys
```

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

See [`LICENSE`](./LICENSE) for the full license terms.

Relevant source files use:

```text
// SPDX-License-Identifier: BUSL-1.1
```

## Documentation

[ourblast.xyz/docs](https://ourblast.xyz/docs)
