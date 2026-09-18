# Terms and Privacy pages for ourblast.xyz

X requires a public Terms of Service URL and Privacy Policy URL for the @ourblastbot app. This adds both pages on your own site, in the site's paper/ink/red style, plus footer links so they are reachable.

## What gets built

**/terms — Terms of Service**
- Plain-language terms written as yours (not "certified" or "audited" by anyone).
- Covers: OURBLAST is a community project around a meme coin with no intrinsic value; the arcade charges 1 SUI per run with a published split and rewards are not guaranteed; you keep custody of your own wallet and we never ask for seed phrases; token launches prepared in the terminal or through @ourblastbot are drafts you sign yourself; no financial advice; community rules (no spam, abuse, or illegal content) and that accounts can be muted or banned; content you post can be moderated or removed; the service is provided "as is" with no liability for on-chain losses; terms can change, with a "last updated" date.

**/privacy — Privacy Policy**
- What is stored: your Sui wallet address, nickname and avatar seed, points and game results, chat messages, memes you submit, terminal command history, connected GitHub profile data for Blast Build, and X username plus tweet text when you call @ourblastbot.
- Why: to run the leaderboards, chat, builder cities and the launch bot.
- Who else sees it: the hosting and database provider, GitHub, X, and public blockchain data (which is permanent and public by nature).
- No selling of data, no ad tracking; how to ask for deletion of your profile and posts.
- Note that public leaderboards, builder cities and chat show your nickname and wallet address publicly.

**Wiring**
- Footer links on the landing page next to X / Telegram, and small links on the terminal page footer area.
- Both pages get their own page title, description and social preview tags, and are added to the sitemap so X can fetch them.

## What I need from you

Two facts I won't invent:
- A contact email or Telegram handle for privacy/terms questions (X and app stores expect a contact route).
- The name to publish as the operator: "OURBLAST community" or something else.

If you'd rather not pick now, I'll publish with the Telegram group as the only contact and "the OURBLAST community" as the operator, and you can correct it later.

## Technical notes

- Two new routes: `src/routes/terms.tsx` and `src/routes/privacy.tsx`, each with a `head()` (unique title/description/og/twitter), rendered inside the existing AppShell using semantic tokens only.
- `src/routes/sitemap[.]xml.ts` gains both paths.
- No database or backend changes; no claims about certifications, encryption standards or compliance frameworks.

## Still in flight from the X bot work (unchanged)

The live reply pipeline, mention poller, and the SuiPump + Maelstrom pad options are already built and typechecking; the bot stays in dry run until the four @ourblastbot keys are saved.
