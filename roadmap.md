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
- [x] Save the four @ourblastbot X credentials
- [x] Mentions checked every minute on a schedule; replies keep a single cashtag (X rule)
- [x] AI understanding fallback for free-form requests (terminal + X), re-parsed through the same allowlist
- [x] Gas reserve created: 0x4821caf89b14973ce38ae0abb98ee8e38e2280dfb58a61266ff07501ce6414e3 (needs 1 SUI)
- [x] Launch platform config supports SuiPump and Maelstrom (selectable per launch)
- [x] X OAuth 2.0 (PKCE) user connect: /oauth/x/return callback, encrypted token storage, Connect X button on the terminal
- [x] Save X_CLIENT_ID and X_CLIENT_SECRET (callback https://ourblast.xyz/oauth/x/return)
- [ ] Wire real token creation once SuiPump / Maelstrom API docs are available
- [x] Harden tweet parsing: mentions anywhere, polite filler, emoji/links/hashtags, launch synonyms, 280-char safe replies
- [x] Custom LP settings (pair token, starting LP, dev buy, supply) parsed from commands/tweets, editable in the launch card, clamped per pad
- [x] Launch links from X prefill the terminal composer with the parsed launch
- [x] Fee policy: 0 launch fee; creator fee splits 20% OURBLAST treasury / 10% developer / 70% launcher
- [x] Gas policy: terminal launchers pay their own Sui gas; X launch calls are sponsored by the @ourblastbot SUI reserve
- [x] Gas reserve account: generated server-side, key encrypted at rest and never exposed; public address + balance shown on the terminal; 0.01 SUI per creator-fee claim recorded as a top-up
- [ ] Fund the reserve with 1 SUI and wire sponsored transactions once real launches go live
- [ ] Route the 20/10/70 creator-fee split on-chain once the launchpad exposes fee-recipient configuration

## Legal pages
- [x] /terms and /privacy published, linked in the landing footer and listed in the sitemap (for the X app form)
- [ ] Replace the Telegram-only contact with a real email + operator name if you want one
- [x] Creator fee payout options: claim yourself (default), send to another Sui wallet, or park for an X account with a one-time OURBLAST claim link (/claim/<token>)
- [ ] Release parked X-account fees on-chain once the launchpad exposes fee-recipient configuration

## Social sign-in
- [x] Continue with Google (managed Cloud auth) and Continue with X (same X app as the bot) on the terminal
- [x] Profiles work without a wallet address; wallet can be connected later for signing
- [ ] zkLogin wallet for social players (needs a Mysten Enoki API key)

## OurBlast X Launcher (simple)
- [x] Tweet "Deploy $TICKER NAME on LAUNCHPAD" → one launch request per X post (duplicate-proof)
- [x] Launchpads: Suipump (default), Maelstrom, RIPT, Blast.fun, ViceFun via one adapter
- [x] Simple launch card on /terminal: ticker, name, launchpad, dev buy OFF, OurBlast fee 10%, one LAUNCH button
- [x] Launch runs on the backend-held OurBlast wallet; never claims deployed before confirmation
- [x] X replies: "launch request received" on mention, token + pool links only after confirmation
- [x] Admin → X launcher: default launchpad, OurBlast fee %, developer buy, automatic launch
- [x] Suipump adapter built against the live mainnet package (`bonding_curve::create_with_launch_fee`),
      signed by the OurBlastBot wallet, simulated before submit, configurable via
      SUIPUMP_PACKAGE_ID / SUIPUMP_LAUNCH_REGISTRY_ID / SUIPUMP_LAUNCH_FEE_SUI /
      SUIPUMP_CREATE_OPTION_A|B / SUIPUMP_FEE_PAYEES / SUIPUMP_LAUNCH_ENABLED
- [ ] Blocked: Suipump must issue a `LaunchTicket` to the OurBlastBot deployer address
      (tickets are minted only by their `LaunchIssuerCap`) — admin → X launcher shows readiness
- [ ] Verified launch integration for a launchpad (all pads currently report "coming soon")

## Suipump integration (read-only API)
- [x] Live Suipump data reads (token list, curve stats, on-chain supply) via https://suipump-main-web.onrender.com
- [x] Launch-by-hand flow: "Create $TICKER on Suipump" + verified confirmation before any "deployed" claim
- [x] Poller auto-confirms new Suipump curves for open X launch requests and replies with the real token link
- [ ] Automatic token creation — blocked: Suipump publishes no launch endpoint or contract entry
