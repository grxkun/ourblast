# Roadmap

- [x] Fix blank 3D Builder City rendering in browser
- [x] Upgrade city skyline and environment visuals
- [x] Add rotate, zoom, helicopter view, and level controls
- [x] Show repository owner on selected buildings
- [x] Verify desktop and mobile 3D interactions
- [x] Shape the 3D map into tropical Blast Island with satellite cities
- [x] Add a Blast Island atlas where each city dot represents one developer
- [x] Let visitors select a developer dot and open that builder's full city
- [x] Replace the city-dot atlas with a 100-city 3D Blast Island map
- [x] Scale island city size by real Sui GitHub or verified Builder Score
- [x] Separate the island map and selected Builder City details
- [x] Add a central tropical volcano with crater, lava, smoke, and city clearance
- [x] Add visible island roads, junctions, roundabout, and enhanced volcanic terrain
- [x] Make individual Builder City views read clearly as islands with raised roads and a wider island-first camera
- [x] Reshape individual cities as rugged, elongated tropical islands with irregular coastlines and mountain ridges
- [x] Add a dense supporting skyline so each island reads as a real city while repository buildings remain landmarks
- [x] Separate island terrain from city infrastructure and buildings in the individual Builder City scene

## OURBLAST Terminal

- [x] Add `/terminal` and expose it in desktop and mobile navigation
- [x] Build the conversational terminal with command suggestions, history, attachments, and launch configuration
- [x] Add a transport-neutral intent parser, allowlisted tool registry, transaction states, and Blast.fun adapter
- [x] Reuse the Sui wallet session and prepare the X account connection abstraction
- [x] Verify desktop, tablet, and mobile terminal flows without simulated transaction success
- [x] Lock the Terminal behind a tester allowlist (0x46e5…2b5a)

## X bot (@ourblastbot)
- [x] Mention pipeline: shared parser/tools, reply composer, dry-run inbox, secret-verified /api/public/x-mention
- [x] Rename the bot handle to @ourblastbot (parser accepts both)
- [x] Live reply posting (OAuth 1.0a) + mention poller; goes live automatically once the four X secrets are saved
- [ ] Save the four @ourblastbot X credentials
- [x] Launch platform config supports SuiPump and Maelstrom (selectable per launch)
- [x] X OAuth 2.0 (PKCE) user connect: /oauth/x/return callback, encrypted token storage, Connect X button on the terminal
- [x] Save X_CLIENT_ID and X_CLIENT_SECRET (callback https://ourblast.xyz/oauth/x/return)
- [ ] Wire real token creation once SuiPump / Maelstrom API docs are available
- [x] Harden tweet parsing: mentions anywhere, polite filler, emoji/links/hashtags, launch synonyms, 280-char safe replies
- [x] Custom LP settings (pair token, starting LP, dev buy, supply) parsed from commands/tweets, editable in the launch card, clamped per pad
- [x] Launch links from X prefill the terminal composer with the parsed launch
- [x] Fee policy: 0 launch fee; creator fee splits 20% OURBLAST treasury / 10% developer / 70% launcher
- [ ] Route the 20/10/70 creator-fee split on-chain once the launchpad exposes fee-recipient configuration

## Legal pages
- [x] /terms and /privacy published, linked in the landing footer and listed in the sitemap (for the X app form)
- [ ] Replace the Telegram-only contact with a real email + operator name if you want one
