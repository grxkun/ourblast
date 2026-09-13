# Replace personal projects in the Sui directory

## Outcome
- Remove the current connected-user repositories from the public Sui Ecosystem directory without deleting the user’s private Builder City or GitHub connection.
- Stop future GitHub syncs from automatically publishing personal repositories into that directory.
- Populate the directory from a live GitHub search of established Sui repositories owned by individual developers, ranked primarily by stars.

## Implementation
- Add a server-side GitHub discovery function with strict Sui/Move relevance filters, individual-owner checks, archived/fork exclusion, deduplication, a bounded result count, and graceful fallback behavior.
- Update the directory cards and filters for discovered GitHub projects, linking directly to their repositories and showing stars, language, and owner.
- Keep on-chain verified projects and personal Builder Cities separate so user repository sync remains useful without becoming a public ecosystem submission.
- Remove only the existing auto-published directory rows through a database migration; preserve builder, repository, city, score, and GitHub connection records.

## Validation
- Confirm the user’s repositories no longer appear in the Sui directory.
- Confirm high-star, individual-owned Sui repositories render on mobile and desktop.
- Confirm personal Builder City data remains intact and future syncs do not republish it.
