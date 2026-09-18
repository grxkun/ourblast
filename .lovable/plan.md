# @ourblastbot X launcher + suipump.org

## Where things stand

- The mention pipeline already exists: a tweet is parsed by the same brain as the terminal, a reply is drafted and stored, and nothing is posted (dry run).
- The bot handle is now @ourblastbot; the parser accepts both spellings.
- The launch step itself is still deliberately unconnected — no token is created anywhere yet.

## What you need to do in the X portal

On the app setup screen in your screenshot:

- App type: **Web App, Automated App or Bot** (confidential client)
- Callback URI / Redirect URL: `https://ourblast.xyz/oauth/x/return`
- Website URL: `https://ourblast.xyz`

Then, from the app's Keys and tokens screen, you will be asked to save four values:
API Key, API Key Secret, Access Token, Access Token Secret. The access token pair must be
generated with **Read and write** permission, otherwise the bot can read mentions but never reply.

## What gets built

1. **Live replies from @ourblastbot.** Replies stop being drafts: each drafted reply is
   posted back to the tweet that called the bot, once, with a record so the same tweet is
   never answered twice.
2. **Mention watching.** A scheduled check pulls new mentions of @ourblastbot every couple of
   minutes, remembers the last one it saw, and runs each new one through the launcher.
   Rate-limit and error responses from X are logged and retried later, never silently dropped.
3. **Launch-call box upgrade.** The terminal's launch-calls panel gains a live/dry-run switch,
   the posted reply link, and X error messages, so you can watch the bot working.
4. **suipump.org as the launch platform.** The launchpad label, reply links and launch cards
   move from blast.fun to suipump.org, behind a single platform config so it can be pointed
   elsewhere later. Real token creation is wired only once their API is documented — until
   then the launch card keeps saying the launch itself is not connected, and the bot's reply
   links the caller to the terminal to sign, exactly as now.

## Open item

I still need the suipump.org API documentation (or the endpoint they gave you) before real
launches can be created. Everything above works without it; only the final "create the token"
step waits on it.

## Technical notes

- Secrets: `X_BOT_API_KEY`, `X_BOT_API_SECRET`, `X_BOT_ACCESS_TOKEN`, `X_BOT_ACCESS_SECRET`
  requested through the secure secret form; read only inside server handlers.
- New `src/lib/terminal/x-api.server.ts`: OAuth 1.0a user-context signing (HMAC-SHA1) for
  `POST /2/tweets` with `reply.in_reply_to_tweet_id`, plus `GET /2/users/:id/mentions`
  with `since_id`. Provider status and body surfaced on failure.
- `X_BOT_DRY_RUN` becomes derived: live only when all four secrets are present.
- Poller: `src/routes/api/public/x-poll.ts` guarded by the existing `X_BOT_WEBHOOK_SECRET`
  bearer check, scheduled with pg_cron against the stable project URL.
- Migration: `x_bot_state` table (single row: `last_mention_id`, `updated_at`, service-role
  only) and new columns on `x_mentions` (`reply_post_id`, `post_error`, `posted_at`).
- Platform config: new `src/lib/terminal/launchpad.ts` (`{ id: "suipump", label: "SuiPump",
  site: "https://suipump.org" }`); `LaunchConfiguration.launchpad` widens from the literal
  `"blast.fun"`, and `blastFunAdapter` is renamed to a launchpad adapter keeping the same
  NOT_IMPLEMENTED contract.
- Reply composer keeps its rule: it never claims an on-chain launch happened.
