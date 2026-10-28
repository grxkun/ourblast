# Decision artifacts

Read when a team needs a shareable plan, numerical comparison, unlock analysis or operator handoff. Match the artifact to the decision; create only what is useful. Use the environment's document, spreadsheet, presentation or visualization skill when producing that format. A Markdown plan or CSV can be sufficient.

## Choose a deliverable

| Need | Smallest useful artifact |
| --- | --- |
| Explain mechanics or decide the route | Short decision memo; a participant-flow diagram if helpful |
| Tune allocation, treasury and liquidity together | Scenario table or spreadsheet with editable assumptions and computed outputs |
| Explore post-launch pool trades and presale-holder exits | [Presale market simulator](https://docs.blast.fun/tools/presale-market-simulator/), adapted from [the original](https://blast-sim.onrender.com/) with validated allocations and explicit pool assumptions |
| Understand cliffs and tradable float | Cohort unlock CSV and chart, marking assumed claim/migration anchors |
| Align a team or share with advisors | Launch brief combining decision, economics, terms, risks and next decisions |
| Prepare implementation | Draft settings sheet with release support and unresolved execution checks |

Use the established destination. In the Blast workspace, generated models/charts go under `outputs/<category>/<date>-<task>/` with an artifact README naming purpose, source checkout/commit, entry file and publication status. Durable business decisions belong under `documents/` when requested. Keep wallet lists, financing terms and other private inputs local/private unless sharing is explicitly authorized. Outside this workspace, follow the user's destination or the environment's artifact convention.

## Contents that make a model reviewable

The market simulator is linked under **Presales → Market simulator**. Preserve supply, accepted raise (excluding overflow), coin decimals, buyer/LP/protocol shares, LP raise share, unlocked buyer percentage, venue, input fee and trade sequence. Allocations use integer basis points and largest-remainder rounding with one modelled recipient; multiple actual recipients can round differently. Default protocol rates are editable assumptions, not live policy.

Cetus/Bluefin trades use continuous constant-product estimates with input fees outside reserves. Aftermath uses a 50/50 model with the DAO input fee outside reserves and an additional retained 0.01% base swap fee. Neither is an executable venue quote: finite ticks, seed residuals, external rounding, deployment policy and live pool fees require separate verification. The unlock percentage is a manual snapshot, not a claims or vesting engine; unlocked buyer + LP value is not circulating market cap. Dollar values assume a stable quote coin. Demand, MEV, other pools and Sui/USD changes are not modeled. Use the separate [presale price simulator](https://docs.blast.fun/teams/simulator/) for overflow fill and refund examples and the [curve builder](https://docs.blast.fun/launchpad/builder/) for bonding-curve mechanics.

- **Decision:** goals and non-negotiables, preferred route, alternative and the fact that would reverse the recommendation.
- **Inputs:** confirmed versus assumed values, quote asset/decimals, supply, protocol rates with provenance, demand and cost assumptions. Mark editable inputs separately from calculated fields.
- **Allocation rows:** asset, purpose, beneficiary or unresolved owner, percent of the named base, amount, immediate amount, vesting/custody and enforcement status. Include protocol and LP rows. Reconcile token and quote tables independently.
- **Vesting rows:** cohort/beneficiary, asset, funded amount, anchor/event, cliff, period, periods, final unlock and authority. For unlock exports add relative time/date, cumulative unlocked, newly unlocked, remaining locked and cohort. Reconcile final unlocked amounts to original allocations and amounts paid before the schedule.
- **Scenario outputs:** relevant prices and their denomination, pool/curve gap, net usable treasury, cash runway/deficits, float components, concentration and key unlocks. Name unavailable execution/depth checks. Projections and illustrative fees are clearly labeled.
- **Evidence and next steps:** source revisions, deployment/app verification, policy reading date, benchmark URLs, unresolved assumptions, decisions and owners. Public-facing draft wording must agree with the model.

For a calculator, preserve inputs, formulas or calculation code, and the state/trade assumptions needed to reproduce it. Check conservation and fee bases, boundary conditions and cliff steps before delivery. An interactive model must show the assumptions on screen and cannot silently normalize invalid allocations into a valid-looking plan.

## Handoff readiness

Translate to named contract/SDK fields only after the mechanism and economics are agreed. For every field, identify its source and whether the intended release supports it. Verify quote/venue admission, policy and fee snapshots, recipient addresses, eligibility feasibility, supply/rounding, vesting anchors, authority holders and funded operators for settlement/migration/claims. Keep unavailable features as requirements with a stated integration gap rather than inventing configuration fields.

The artifact remains **draft, not submitted** unless the user explicitly authorizes the external action. A sound model is not evidence that a deployment or app rollout exists.
