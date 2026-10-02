# OurBlast

Onchain trading and launch infrastructure for the Sui ecosystem, powering **OurBlastbot** and OurBlast integrations.

## Overview

OurBlast is a Sui-based onchain application with integrations for token discovery, trading, social/X workflows, Telegram, and Blast.fun.

The repository contains the application source code and integration logic used by OurBlast.

## Blast.fun Integration

OurBlast includes integration code for interacting with Blast.fun's launch infrastructure.

The main Blast.fun implementation is located under:

```text
src/lib/terminal/
```

with the primary launch integration in:

```text
src/lib/terminal/blastfun-launch.server.ts
```

The integration handles Sui transaction construction and execution for Blast.fun-related workflows.

### Deployment

**No Blast.fun contract has been deployed by OurBlast as part of this repository handoff.**

This repository is provided for technical review and integration. Any required contract or infrastructure deployment should be handled by the Blast.fun team.

## Architecture

```text
OurBlast
   │
   ├── Web Interface
   ├── OurBlastbot
   ├── X / Social Integration
   │
   ▼
Sui Integration Layer
   │
   ├── Wallet / Signing
   ├── Transaction Builder
   └── Blast.fun Integration
   │
   ▼
Sui Network
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

Production credentials must be provided through environment variables.

Do **not** commit:

```text
.env
.env.local
private keys
mnemonics
API keys
access tokens
service-role keys
```

An example environment file can be provided separately when required.

## Security

Private keys and production credentials are not included in this repository.

Any wallet used for transaction execution must be configured separately in the deployment environment.

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**.

See [`LICENSE`](./LICENSE) for the full license terms.

Relevant source files use:

```text
// SPDX-License-Identifier: BUSL-1.1
```

## Integration Status

| Component                       | Status                         |
| ------------------------------- | ------------------------------ |
| Sui integration                 | Active                         |
| OurBlastbot                     | Active                         |
| Blast.fun integration           | Available for technical review |
| Contract deployment by OurBlast | None                           |
| License                         | BUSL-1.1                       |

## Contact

For Blast.fun integration and technical coordination, please contact the OurBlast development team.
