# Roadmap
- [ ] Stop repeated Telegram updates from duplicating replies or transfers; acknowledge promptly and test retry/error handling without live sends.
- [x] Replace retired swap build/simulation connection with official Sui GraphQL; 35 tests and unsigned SUI→USDC simulation on Grxxxkun wallet passed, no signing/submission; publishing requested.
- [x] Restore OurBank Sui holdings with official GraphQL; seven tests and real-wallet read passed (not published; Telegram delivery unverified).
- [x] Fix shared Solana RPC fallback; 30 tests passed and live balance/blockhash reads verified without sending transactions (not published)
- [x] Fix Telegram buy address preservation in bot buttons and Mini App swaps; verified with mocked trades
- [x] Pay out QLONG 21.88 USDC 80/10/10 to Willie (OBB4ever)
- [x] Fee routing falls back to OurBank wallet
- [x] Publish routing fix
- [x] Fix 7 points/arcade self-report findings (signed-in users can set scores/claims), then re-run security scan
- [ ] Update GitHub repo — blocked: needs GitHub connected in Lovable (syncs automatically after)

- [x] Cross-chain buy: HyperEVM + Monad added; NEAR (NEAR Intents) and Robinhood Chain (Relay → Arbitrum/Base) linked as alternate routes
- [x] Open EVM deposit bridge + auto-buy to all users (public test)
- [ ] Wire cross-chain buy into X bot — blocked: waiting until @Ourblastbot X is active again
- [x] Solana deposit watcher: SOL/USDC → SUI (NEAR Intents) → auto-buy $BLAST (preview; no live funds tested)
- [x] Terminal chat: "bridge 0.03 sol" / "buy blast with 0.03 sol" (preview)
- [x] BNB Chain: show BNB balance on the OurBank EVM address; bridge BNB → SUI via NEAR Intents on user command
- [x] Launch Sui tokens paid with SOL/ETH/BNB (X + terminal): review → confirm → bridge (no auto-buy) → launch on arrival
- [x] BNB → SOL → SUI fallback route via Relay when 1Click refuses BNB
- [x] Bridge SUI → SOL (terminal + X); SUI → ETH/BNB blocked by provider
- [x] TG mini app: mockup layout (home hero, discover cards, token detail, wallet balance card) in existing OURBLAST colors
- [x] Blast.fun partner API: presales feed in TG Discover (live once BLAST_PARTNER_KEY added)
- [x] Add SPDX BUSL-1.1 header to every source file (Blast key requirement)

## Telegram trading bot (one by one)
- [x] Dev wallet alerts (follow/unfollow/following, alert only)
- [x] Token sniping (confirm-first, slippage cap)
- [x] Presale buys in TG chat (confirm-first; live once BLAST_PARTNER_KEY added)
- [x] Copy trading (bot chat)
- [x] Presale buys (Blast) — live once BLAST_PARTNER_KEY added
- [x] Copy trading (bot chat)
- [x] Limit orders
- [x] Main trade tokens (USDC, LOFI, ZUK, BLUB, CETUS, SEND, BLUE, WAL, DEEP, SOH) by ticker on all platforms
- [x] Fix 'couldn't read your OurBank wallet' on buys (GraphQL balances)
- [x] NFT reader on OurBank wallet (read-only)
- [x] /docs dev-fee split reads launch payees via Sui GraphQL
- [x] Send tokens held as address balances (no Coin object) — tx.coin intent draws coins + accumulator; live mainnet simulation of YoBooogie's 1000 ONE send passed (unsigned, nothing broadcast)
- [ ] "No.2" — unclear which item; asked user to confirm
