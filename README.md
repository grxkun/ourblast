# OurBlast

OurBlast is an onchain trading and launch interface built around the Sui ecosystem, with Telegram/X integrations and Blast.fun launch functionality.

## Overview

OurBlast provides:

* Onchain token discovery and trading tools
* Blast.fun token launch integration
* Telegram bot integration
* X/social integration
* Sui wallet and transaction handling
* Token launch and bonding-curve interaction
* Backend services for transaction execution

The project is designed to interact with existing Sui and Blast.fun infrastructure rather than deploying or modifying Blast.fun contracts.

## Blast.fun Integration

OurBlast includes an integration layer for interacting with Blast.fun's launch infrastructure.

The relevant implementation is primarily located under:

```text
src/lib/terminal/
```

Key integration logic includes:

```text
src/lib/terminal/blastfun-launch.server.ts
```

This module handles the client-side/server-side interaction required for Blast.fun token launches, including transaction construction and execution.

### Important

This repository does **not** deploy any Blast.fun contract as part of this integration.

No contract deployment has been performed by the project for the purpose of this integration.

Deployment of any required contracts or infrastructure should be handled by the Blast.fun team.

## Architecture

```text
                ┌─────────────────┐
                │     OurBlast     │
                └────────┬────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
      Telegram          X/Social       Web UI
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  OurBlast Backend
                         │
                         ▼
                    Sui Network
                         │
                         ▼
                    Blast.fun
```

## Repository Structure

```text
src/
├── lib/
│   ├── terminal/
│   │   ├── blastfun-launch.server.ts
│   │   └── ...
│   └── ...
├── ...
```

The repository also contains supporting services, database migrations, UI components, and integrations used by OurBlast.

## Transaction Execution

Blast.fun-related transactions are constructed and executed through the Sui transaction infrastructure.

The integration may require a configured wallet/signer and the appropriate environment variables.

No private keys or production credentials are included in this repository.

## Environment Variables

Production credentials must be supplied through environment variables.

Do not commit:

```text
.env
.env.local
private keys
mnemonics
API keys
access tokens
service-role keys
```

## Development

Install dependencies:

```bash
bun install
```

Run the development environment:

```bash
bun run dev
```

Build:

```bash
bun run build
```

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

Relevant source files include the following SPDX declaration:

```solidity
// SPDX-License-Identifier: BUSL-1.1
```

See [`LICENSE`](./LICENSE) for the complete license terms.

## Integration Notes for Blast.fun

This repository is provided for technical review and integration.

Blast.fun can review the existing integration implementation and determine the appropriate deployment, contract, infrastructure, and production configuration on its side.

**No Blast.fun contract deployment is requested or performed by OurBlast as part of this repository handoff.**

## Status

**Integration:** Ready for technical review

**Network:** Sui

**Blast.fun:** Integration layer included

**Contract deployment by OurBlast:** None

**License:** BUSL-1.1
