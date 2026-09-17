# OURBLAST Terminal

## Goal

Add a production-ready `/terminal` experience to the existing OURBLAST app. It will feel conversational and execution-focused while retaining the current paper/ink/red/cyan visual language, Sui wallet flow, TanStack routing, and shared navigation.

## User experience

- Add **Terminal** to the shared desktop and mobile navigation.
- Build a desktop-first terminal with a compact identity header, scrollable conversation, recent-command rail, and a composer fixed within reach on mobile.
- Use the existing OURBLAST helmet identity and visual tokens rather than creating a separate dashboard theme.
- Show suggested commands when empty, including launch, token check, bonding curve, wallet, launches, and trade prompts.
- Support command entry, click-to-fill suggestions, rerun, copy, clear history, and per-wallet or anonymous-session local persistence.
- Reuse the existing Sui wallet connection and show the connected wallet identity without exposing sensitive information.
- Add a real **Connect X** boundary and `XAccount` interface, but report it as not connected until OAuth is configured; no fake identity.

## Conversational launch flow

- Parse supported natural-language commands into typed intents for create/launch, token lookup, wallet, portfolio, launches, bonding curve, buy, sell, and transaction lookup.
- Render user commands and assistant responses using installed AI Elements conversation, message, prompt input, attachment, and tool-result foundations.
- For launch commands, create an editable launch draft with validated name, symbol, image, Sui network, and Blast.fun launchpad fields.
- Support image selection, drag-and-drop, and clipboard paste with preview/removal; keep the image local to the draft in V1.
- Include **Generate Image** as an honest unavailable action unless an existing compatible generator is discovered.
- Require a connected Sui wallet before blockchain tools proceed. Launch, buy, and sell remain `NOT_IMPLEMENTED` and never display a confirmed or deployed result.

## Shared agent and tool architecture

- Keep the UI separate from the command system with typed terminal messages, intents, tool inputs/outputs, and transaction states.
- Add a framework-neutral parser and terminal agent that dispatches only to an allowlisted tool registry.
- Implement registry entries for `createToken`, `launchToken`, `getToken`, `getWallet`, `getPortfolio`, `getLaunches`, `getBondingCurve`, `buyToken`, `sellToken`, and `getTransaction`.
- Placeholder read tools return explicit structured availability states. Mutation tools return `NOT_CONNECTED` or `NOT_IMPLEMENTED`, never fabricated blockchain results.
- Keep the parser/tool layer transport-neutral so a future authenticated X mention endpoint can call the same agent instead of duplicating launch logic.
- Model the complete future deployment result and transaction timeline so real adapter results can later drive terminal cards and X replies.

## Blast.fun integration boundary

- Add a centrally configured `BlastFunAdapter` with network, optional factory package/object, and version.
- Expose factory, create, launch, bonding-curve, launch-status, and migration-status methods through the adapter.
- Leave unknown factory/package/object values unset and surface configuration as unavailable. UI code will not contain addresses or Move targets.
- Do not construct arbitrary Move calls or server-side signatures.

## Technical details

- Route: `src/routes/terminal.tsx`, with unique title, description, Open Graph, and Twitter metadata.
- Feature modules: `src/components/terminal/` for the visible terminal and `src/lib/terminal/` for types, parser, registry, tools, agent, X identity contract, and Blast.fun adapter.
- Install the official AI Elements registry components required for conversation, message, prompt input, attachments, tool display, and loading states; adapt only around their exported primitives.
- Use existing shadcn controls and semantic design tokens. Assistant messages stay unfilled; user commands use an intentional high-contrast role treatment.
- Store only sanitized command history and serializable result metadata in browser storage. Do not persist image bytes, private wallet information, signatures, or secrets.
- Add transaction status rendering for `NOT_CONNECTED`, `READY`, `AWAITING_SIGNATURE`, `SUBMITTING`, `CONFIRMED`, `FAILED`, and `NOT_IMPLEMENTED`; V1 can reach only honest non-execution states.

## Validation

- Verify parsing across all supplied command forms, validation failures, unknown commands, and wallet-required actions.
- Verify launch editing and image picker/drop/paste behavior.
- Verify history persistence, copy, rerun, and clear behavior.
- Verify Sui wallet reuse and disconnected action messaging.
- Verify no launch/buy/sell path claims success or displays invented addresses.
- Run project typecheck/build and lint after AI Elements installation and composition.
- Exercise `/terminal` with Playwright at desktop, tablet, and mobile sizes, checking sticky input, readable contrast, navigation, no overlap, no overflow, and no console errors.
- Recheck an existing route to ensure the shared navigation change does not disrupt the rest of OURBLAST.

## Not included in V1

- Real Blast.fun Move calls, factory assumptions, signing, token deployment, buying, selling, or bonding-curve execution.
- Live X OAuth, mention ingestion, X replies, or a custodial wallet.
- New image-generation infrastructure.
