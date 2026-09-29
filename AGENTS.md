<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- OurBank wallet keys can live in Turnkey enclaves (`signing_backend` on `bank_wallets`); all signing goes through `bankSigner()` in bank-wallet.server.ts — never read `secret_ciphertext` directly elsewhere. Why: key location must be swappable without touching trade/send logic.
- Each launchpad gets its own `<pad>-launch.server.ts` executor plus a pure `<pad>.ts` constants/math module, routed from `xLauncher.server.ts` by `pad.id`. Why: pool mechanics differ per launchpad and must stay testable without chain access.
- Terminal LAUNCH goes through `launchFromTerminal` → `createLaunchRequest` + `executeLaunchRequest`, the same pipeline as X mentions, with a per-user/token/minute request id. Why: one launch path means one set of idempotency and confirmation rules.
- Maelstrom coin publishes must finalize `Currency<T>` into the Sui coin registry before pool creation. Why: indexers otherwise show `???` and `UNVERIFIED COIN` despite valid pending metadata.
- Perpsplexity composite first buys use `cash_prices` → `buy_cash`, signed and received by the creator wallet; never use low-level `composite_pool::buy`. Why: the public cash path is the live trading flow and avoids the clearing-house `active()` abort.
- `composite_pool::buy_cash` takes the pool's own sleeve/reserve/reserve-account trio, never the engine's sleeve/vault/account. Why: the engine objects abort in `basket::check_cash`.
- A planned composite first buy rides inside the bot-sent activation transaction: the creator first moves exactly the buy USDC to the bot, the bot spends that coin via cash_prices(on activate's returned ClearingHouse, before share) → buy_cash, and the Position goes to the creator. Why: snipers buy within a second of `composite_pool::Created`, and Sui rejects creator-sent/bot-sponsored activation here.
