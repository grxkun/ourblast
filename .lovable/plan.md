# Blast Build — Phase 2 Preview Construction

## Goal
Prepare the full city-upgrade experience using the official BLAST token from the existing Bluefin link, without sending or locking tokens until a reversible lock contract is available.

## What will be built
- Centralize the canonical BLAST coin type and token decimals used by Blast Build.
- Show the connected wallet’s formatted BLAST balance.
- Add a construction panel for verified repositories with building selection, upgrade target, BLAST amount, balance checks, and a clear before/after preview.
- Keep the final confirmation visibly disabled and explain that no transaction will be requested during preview mode.
- Add construction-ready data structures for future verified lock transactions and public history, without recording previews as completed construction.
- Update project progress to mark the preview foundation complete while leaving on-chain locking and verification blocked.

## Technical details
- Reuse the existing Sui wallet session and Builder City data.
- Keep preview calculations deterministic and centralized; Builder Score remains reputation-only and is not purchased with BLAST.
- Do not transfer BLAST to the treasury and do not create a fake lock transaction.
- Preserve existing landing, arcade, rankings, atlas, and public builder profiles.

## Validation
- Verify the canonical token balance is formatted correctly.
- Verify only eligible verified buildings can be previewed.
- Verify insufficient balance and maximum-level states.
- Verify no wallet transaction request can occur.
- Check desktop and mobile layouts with reduced-motion support.
