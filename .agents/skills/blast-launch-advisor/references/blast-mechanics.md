# Blast mechanics and source map

Use this reference for product education, route selection and checking whether a proposed feature exists. These are navigation and high-impact gotchas, not an executable configuration specification.

## Resolve the evidence

In the Blast workspace, find repositories through `repos/README.md`; the workspace root is three parents above this skill directory. Read repositories without changing their branch or files. Outside the workspace, use the corresponding GitHub repositories and public [Blast docs](https://docs.blast.fun/). Private or unavailable source limits confidence; report the gap.

Initial review: **27 October 2026**. Contracts at `d2917bbb8570fb5a86f065e83c0c1fc1909dfc4a`, docs at `db728d34b46ab7b4e094cf18966888f8d45613a8`, SDK at `4bda8ab307783b34bfe32cf9079db748a5c2f312`, utilities at `8049353ec356f659e2d53ee535f6881b2d703308`. Recheck the intended revision on each advisory engagement. The inspected presale manifest pins vesting utilities to `63b6cf86c0e1a74f699610fe182b1de8d8789a14`; a dependency's latest checkout need not be the version a product uses.

| Question | Read in the owning repository |
| --- | --- |
| Product routing and trust boundaries | `blast-v2-contracts/llms.txt`, then relevant sections of `llms/presale.txt` or `llms/launchpad.txt`; these are large, so use headings/search to select the guide and exact APIs |
| Presale behavior and validation | `blast-v2-contracts/sui/presale/sources/blast_presale.move`, `creation_policy.move`, `fee_policy.move`; venue and vault behavior in that same package |
| Curve supply, lifecycle and math | `blast-v2-contracts/sui/launchpad/sources/lib/constants.move`, `allocation.move`, `curve.move`, `launch.move`, `launch_config.move`, `runtime_config.move` |
| Curve pool migration and fees | `blast-v2-contracts/sui/migrators/sources/`, especially `vault.move`, `lp_fee_policy.move` and the intended venue adapter |
| Vesting semantics | Presale `pay_or_vest`, then its `Move.toml` dependency revision of `blast-util-contracts/sui/vesting/sources/blast_fun_linear_vesting.move` |
| Exact numerical previews | `blast-v2-sdk/packages/presale/src/math.ts`; curve `packages/launchpad/src/{curve,economics,allocation}.ts`; verify against Move before reuse |
| Team education | `blast-v2-docs/src/content/docs/teams/{planning,fees,checklist,after-launch}.md`, `users/{allocation,claiming,safety}.md` |
| Curve education and model | Docs `src/content/docs/launchpad/{launching,tokenomics,safety}.md`, `developers/launchpad-curve.md`, `src/lib/bonding-curve.js` |
| Deployment and availability | Contracts' package `Published.toml`, `deployments/sui/mainnet/` records and docs `src/content/docs/developers/{addresses,presale-versioning}.md`, plus the intended app/release and live policy objects |

Paths in the table are relative to `repos/`. Within a package row, filenames share that row's source directory. For remote source, use `https://github.com/interest-protocol/<repository>/blob/<revision>/<path>`.

Move and tests establish behavior; publication records establish which behavior was published; actual objects and completed events establish state. Docs and generated guides explain those facts. When prose disagrees with source, follow the concrete source and describe the discrepancy. Never combine a historical package address with a newer ABI or policy from another release.

At initial review, the canonical curve and migrators had no committed `Published.toml`; presale records covered multiple publications with different authority/ABI and admission settings. Recheck instead of advertising either as a supported current app flow. Resolve live fees and quote/venue admission only when implementation readiness matters; conceptual planning can use explicit assumptions.

## Presale branch

- A new zero-current-supply coin is supplied; the presale mints and seals its chosen full supply. Current code requires registered, confirmed-unregulated sale currency. Fixed or burn-only supply cannot mint additional rewards later. A failed sale leaves that minted supply locked; the same coin cannot simply retry.
- Buyers commit during a window. Successful overflow sales use one proportional fill and refund overflow when claimed after migration. A hard cap limits accepted commitments while active; excess input returns immediately. A later hard cap preserves earlier overflow. The no-cap phase lifts wallet caps and has separate eligibility rules.
- Token shares cover buyers, pool, Blast and recipients. The successful **target**, not all commitments, funds raise recipients, Blast and the pool. Before opening, Blast's fee changes can shift buyer tokens or pool quote; reread terms at opening.
- Underfunding becomes refundable through settlement. A funded but unmigrated sale can be cancelled by anyone at its liquidity deadline; the liquidity window is at least seven days. Settlement, cancellation, migration and claims require submitted transactions. The team has no general discretionary cancellation/refund button.
- Current validation permits up to 64 distinct recipients per token/raise list, 16 fee recipients and 65,536 participants. Open eligibility has a minimum/participant reachability check; verify exact admission rather than merely summing wallet caps. Treat wallet limits as address limits, not proof of unique humans.
- Buyer tokens can vest under one optional common set of terms, **starting at each claim**. Token/quote recipient schedules start **at migration**. These presale schedules are funded, fixed-beneficiary and irrevocable. Overflow refunds pay immediately. LP-fee shares cannot vest.
- Native buyer terms do not provide a separate upfront-unlock percentage. Per-list recipient addresses must be distinct; duplicating one wallet for immediate and vested portions fails. Describe a different distribution arrangement as extra integration work until verified.
- Current source has Cetus, Bluefin and native Aftermath routes, each subject to release admission. LP fees split after Blast's cut; the holder allocation's quote funds administered rounds, while its sale-token part goes to Blast. Follow presale vault rules for LP custody, residual claims and reward deadlines.

## Bonding-curve branch

- Generated supply is **one billion whole tokens** at admitted decimals; it is not an arbitrary supply input. Curve inventory, separately reserved LP tokens, Blast and project allocations total the original supply. Quote allocations split the **final real reserve**.
- Buys and sells change price against virtual quote plus real quote. Virtual quote is a pricing parameter, never spendable liquidity. Trade fees are tracked separately; sells can reduce real quote and graduation progress. A sell needs real backing even when the displayed virtual-reserve formula quotes a larger output.
- The target is **net real quote reserve**, not gross volume or a valuation. Reaching it closes ordinary curve trading into `MigrationReady`; a migration transaction must still seed the DEX. At graduation, unused curve inventory and pending sell burn are disposed of according to supply mode. Offered inventory is not all sold supply.
- There is no expiry or target-miss refund. If trading never reaches the target, migration allocations remain unavailable. Live sellers receive only executable curve proceeds; they do not redeem their original payment at a guaranteed price.
- Optional opening rounds pool bids for 60–300 seconds, execute one curve buy and distribute its output/refund proportionally. Bids cannot be withdrawn. This does not add presale cancellation or vesting.
- Allocation recipients receive tokens/quote at migration; the current allocation type has **no native vesting terms**. A separate vester may be possible, but requires an actually funded and verified composition. An unfunded promise or later voluntary transfer is not enforced launch vesting.
- LP assets and fee routing belong to the migrators package, with creator, auto-LP, rewards, burn and extra-recipient routes after Blast's share. These mechanisms and their authority differ from presale holder rewards. The current fee-capability holder can change future LP splits under settlement rules.

## Trust and fee language

Separate creation/gas costs, one-time token/quote allocations, curve trade fees, DEX fees, Blast's LP-fee share, and any app fee. A split of collected fees is not a fee on all trading volume. Source initialization or a docs target rate is not a live policy reading.

Explain custody using the intended release: Cetus burn proofs, vault-held positions and compatible upgrades have different properties. “No current withdrawal entrypoint” does not imply an irrevocable guarantee for an upgradeable package. Presale upgrade permissions differ across historical and versioned publications. Metadata authority, fee authority and token minting authority are separate. Claim only the controls the checked release actually enforces.
