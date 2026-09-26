# Turnkey-backed OurBank wallets

Move OurBank bot wallets from AES-encrypted keys in our database to Turnkey's hardware-isolated enclaves, so the bot still signs instantly but private keys never live in our database.

## What changes

1. **Turnkey client (`src/lib/terminal/turnkey.server.ts`)**
   - Signs Turnkey API requests with the saved API key pair (P-256 stamp) and calls `https://api.turnkey.com`.
   - Operations: create a Sui (Ed25519) wallet account per user, import an existing Sui private key, sign a raw transaction payload.
   - Reads `TURNKEY_ORGANIZATION_ID`, `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY` inside handlers only.

2. **Wallet storage (`bank_wallets` table)**
   - Add `signing_backend` column: `'local'` (current AES key) or `'turnkey'`, plus `turnkey_key_id` for the Turnkey account.
   - New wallets are created in Turnkey by default; existing local wallets keep working and can be migrated (requires empty wallet, same as today).

3. **Signing path (`bank-wallet.server.ts`, `bank-swap.server.ts`)**
   - `sendFromBankWallet` and the swap engine build the transaction as today, then route signing: Turnkey wallets sign via the Turnkey API, local wallets sign with the decrypted keypair.
   - Import/reset: imported keys go to Turnkey (never stored in our DB); reset creates a fresh Turnkey account.

4. **UI (`OurBankCard`)**
   - Show a "Turnkey enclave protected" badge on Turnkey-backed wallets.
   - Import/new-wallet flows unchanged from the user's point of view.

## Safety rules kept
- Keys never returned to the client; only addresses leave the server.
- Empty-wallet requirement before replacing a key stays.
- No change to trade limits, parsing, or X mention flow.

## Verification
- Typecheck + existing bank tests pass; new unit tests for the signing-backend routing (Turnkey calls mocked).
- No real Turnkey wallet created or trade signed until you test live after publish.
