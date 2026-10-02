# OurBlast

<p align="center">
  <img src="./assets/banner.png" alt="OurBlast — Onchain trading and launch infrastructure for Sui" width="100%">
</p>

<p align="center">
  <strong>Onchain trading and launch infrastructure for the Sui ecosystem.</strong>
</p>

OurBlast powers the **OurBlast terminal** and **@Ourblastbot**, connecting onchain token launching, trading, wallet functionality, and social workflows across the Sui ecosystem.

## Overview

OurBlast provides:

- Token launching and discovery
- Onchain token trading
- Sui wallet and transaction infrastructure
- OurBlastbot social/X workflows
- Telegram workflows
- Creator-fee and launch infrastructure
- Integrations with Sui launch and trading platforms

## Launch Platform Integrations

OurBlast is designed to work with multiple Sui ecosystem platforms, including:

| Platform | Integration |
|---|---|
| **Blast.fun** | Token launching with SUI pairing |
| **Suipump** | Token launch and discovery |
| **Maelstrom** | Launch infrastructure |
| **Perpsplexity** | Leveraged token launches and perpetual trading |

For current product documentation, see **[ourblast.xyz/docs](https://ourblast.xyz/docs)**.

## Blast.fun Integration

Blast.fun is integrated into the OurBlast launch workflow.

The primary implementation is located at:

```text
src/lib/terminal/blastfun-launch.server.ts
```

The integration uses the Sui transaction layer to construct and execute Blast.fun-related launch transactions.

### Deployment

This repository handoff does **not** require deployment of a new Blast.fun contract by OurBlast.

Any contract deployment or Blast.fun-side infrastructure deployment required for the integration should be handled by the Blast.fun team.

## Architecture

```text
                    OurBlast
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
     Web UI        OurBlastbot     Telegram/X
        │              │              │
        └──────────────┼──────────────┘
                       ▼
               Sui Integration Layer
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Wallet      Transactions   Launch/Trading
          │            │            │
          └────────────┼────────────┘
                       ▼
                   Sui Network
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Blast.fun      Suipump       Maelstrom
                                      │
                                 Perpsplexity
```

## Repository Structure

```text
src/            Application and integration source
public/         Static assets
supabase/       Database and backend functions
package.json    Project dependencies and scripts
bun.lock        Dependency lockfile
LICENSE         BUSL-1.1 license
ARCHITECTURE.md Project architecture documentation
```

## Development

Install dependencies:

```bash
bun install
```

Run the development server:

```bash
bun run dev
```

Build the application:

```bash
bun run build
```

## Environment Variables

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

The repository's `.gitignore` excludes local environment files.

## Security

Wallet signing and production credentials must be configured separately in the deployment environment.

No production credentials should be committed to this repository.

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

See [`LICENSE`](./LICENSE) for the complete license terms.

Relevant source files use:

```text
// SPDX-License-Identifier: BUSL-1.1
```

## Status

| Component | Status |
|---|---|
| Sui integration | Active |
| OurBlastbot | Active |
| Blast.fun integration | Available for technical review |
| SUI launch pairing | Supported |
| New Blast.fun contract deployment by OurBlast | None |
| License | BUSL-1.1 |

## Documentation

Product and integration documentation:

**https://ourblast.xyz/docs**

## Integration

For Blast.fun integration and technical coordination, contact the OurBlast development team.
