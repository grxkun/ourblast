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
