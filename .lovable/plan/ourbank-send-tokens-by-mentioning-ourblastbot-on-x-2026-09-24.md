# OurBank — send tokens by mentioning @ourblastbot on X

## Important limit
The bot cannot move tokens out of someone's own wallet by itself. Only the wallet owner can approve a transfer. Anything else would mean OurBlast holding user funds, which the project rules forbid. So a tweet creates a transfer request, and the sender approves it with one tap in the terminal using the wallet they've linked to their X account. Nothing is sent until the network confirms it.

## How it works
1. **The tweet:** `@ourblastbot send 25 SUI to @alice`, `send 1000 $BLAST to alice.sui`, or `send 5 USDC to 0x…`.
2. **Who can send:** only someone who has signed in with that X account and linked a wallet in OurBlast. Anyone else gets a reply asking them to link first.
3. **The bot replies** with a short private link: "Transfer ready: 25 SUI → @alice. Approve in your OurBlast terminal." The reply never claims the money was sent.
4. **In the terminal**, the sender sees a new **OurBank** card listing their pending transfers: token, amount, recipient and the resolved address. They review it and tap Approve, and their wallet signs.
5. **After the network confirms**, the bot replies on X: "Sent 25 SUI to @alice ✅" with a link to the transaction.
6. **Expiry:** requests expire after 24 hours, and the sender can cancel any time.

## Recipients
- **SuiNS name (alice.sui):** looked up on the network to get the address, and shown to the sender before they approve.
- **X handle (@alice):** sent to the wallet that X account linked in OurBlast. If @alice hasn't linked a wallet yet, the request waits, and the bot tells the sender that @alice must sign in and link a wallet first. No holding account and no claim link, since you rejected claim links as unsafe.
- **Raw 0x address:** used as given.

## Tokens
- Any Sui coin the sender holds.
- The coin is recognised from the tweet (SUI, USDC, a `$TICKER` or a full coin type) and matched against the coins actually in the sender's wallet.
- If a ticker matches more than one coin, the sender picks the right one in the terminal.
- The amount is converted using the coin's real on-chain decimals.

## Safety
- One tweet creates at most one transfer. This uses the same duplicate protection the launcher has.
- The server checks that the X account and the linked wallet match, and that the wallet holds enough of the coin.
- The server confirms the transaction on the network before anything is marked as sent.
- The bot's own tweets are ignored.
- Only one $cashtag is allowed in each reply.

---

## Technical details
- **New table `bank_transfers`:** x_post_id (unique), sender_user_id, sender_x_username, sender_wallet, recipient_kind (x|suins|address), recipient_input, recipient_address, coin_type, symbol, decimals, amount_atomic, amount_display, status (PENDING_APPROVAL, WAITING_RECIPIENT, SUBMITTED, CONFIRMED, FAILED, CANCELLED, EXPIRED), tx_digest, reply_post_id, confirmed_reply_post_id, error, expires_at and timestamps. GRANTs are included. RLS lets senders read their own rows; all writes go through server functions.
- **Parsing:** `src/lib/terminal/bank.ts` handles the "send/tip/pay N TOKEN to X" wording, with tests. `handleXMention` sends matching tweets to `bank.server.ts` before the launch parser runs.
- **Sender check:** x_accounts (matched by x username) → user_id → profiles.wallet_address.
- **Recipient lookup:** SuiNS names are resolved with `suix_resolveNameServiceAddress` on the existing mirror RPC endpoints. X handles resolve through x_accounts → profiles.wallet_address.
- **Coin matching:** `suix_getAllBalances` and `suix_getCoinMetadata`.
- **Server functions in `bank.functions.ts`** (requireSupabaseAuth): listMyTransfers, buildTransfer (returns the transfer transaction for the sender to sign with their own wallet), confirmTransfer(digest), and cancelTransfer.
- **Confirmation:** confirmTransfer checks that the transaction's balance changes match sender, recipient, coin and amount exactly before posting the "Sent" reply.
- **Background work:** the poll loop expires stale requests, and re-checks WAITING_RECIPIENT rows once the recipient links a wallet.
- **UI:** a new `OurBankCard` in the terminal, plus a "Send by tweet" example in the terminal tutorial.
