# Use Aftermath for treasury prices

## Goal
Make Aftermath Finance the primary USD price source for every Sui token held by the community treasury and prize pool, while preserving the current providers as resilient fallbacks.

## Changes
- Add the official Aftermath TypeScript SDK.
- Request all held coin prices from Aftermath in one batch using their mainnet Prices API.
- Normalize Sui coin-type identifiers so Aftermath results map reliably to on-chain balances.
- Use the price order: Aftermath first, then the existing DEX/market fallbacks, with SuiPump retained for bonding-curve tokens.
- Keep token logos sourced from coin metadata and existing image providers.
- If Aftermath is unavailable or lacks a token, continue displaying the best available fallback price instead of failing the treasury panel.

## Verification
- Check that the treasury and prize pool load with no browser errors.
- Confirm SUI and supported treasury tokens display USD prices.
- Confirm an Aftermath failure or missing token still resolves through existing fallbacks.

## Technical details
Aftermath documents `getCoinsToPrice({ coins })` for batched USD prices on Sui mainnet. The integration remains server-side so it does not enlarge the browser wallet flow or expose additional client behavior.
