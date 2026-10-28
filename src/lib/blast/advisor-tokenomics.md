# Tokenomics design

Read for allocations, valuation, funding, vesting or a numerical launch review. Work in the chosen quote coin; USD conversions are dated planning assumptions, separate from protocol math. Whole-unit formulas below teach relationships. Use integer atoms, explicit decimals and the checked SDK/Move rounding for executable previews; retain rational prices until formatting.

## Derive a budget from the goal

Ask what the token does before reserving percentages. For DeFi, examine governance/control, incentive spend and the actual source of fee revenue. For games or consumer products, examine user utility, reward demand, sinks and whether transferable rewards invite extraction. For infrastructure or DePIN, examine provider costs, verification and subsidy decay. For a community coin, focus on access, distribution, liquidity and disclosed creator interests. These are diagnostic lenses, not claims that Blast supplies those product mechanisms.

Build the economic plan backwards:

1. Determine required treasury cash from milestone costs, operating burn and contingency. Identify which funds are usable immediately, and discount volatile quote assets under a stated scenario. Own-token inventory is not cash runway.
2. Reserve real liquidity to support representative trade sizes. Check executable price impact rather than choosing a token percentage because it sounds liquid. Protocol fees and expenses are additional uses of funds.
3. Test whether community demand can support the resulting target: plausible participating wallets × plausible accepted contribution, adjusted for caps, eligibility and concentration. Followers and gross volume do not establish funding.
4. Give each remaining token bucket a purpose and release rule: public distribution, team, advisors, treasury, ecosystem/incentives, investors, pool and protocol. Merge empty labels. Show related-party control across wallets.
5. Check existing promises against a once-minted supply. Recurring incentives need a funded reserve; inflationary issuance or product rewards require separate supported infrastructure.

Reconcile three independent ledgers: token supply totals 100%, successful quote uses total 100%, and post-protocol fee routes total 100% of their own base. A team can have token, quote and fee allocations with different release and control rules; never add their percentages into one pie.

Treasury runway uses actual available balances and costs over time. For vested quote, calculate monthly inflows and outflows; lifetime allocation divided by burn can hide an immediate cash deficit. Estimate fee revenue only as a scenario, including zero revenue: volume × venue fee × position capture × (1 − Blast share) × recipient share, separately per asset. Position capture and volume are assumptions, not guaranteed APR.

## Presale pricing and fill

For successful target `R`, original supply `S`, actual buyer allocation `B`, LP token amount `L` and LP quote `Qlp`:

```text
sale_price = R / B                         quote per token
nominal_pool_price = Qlp / L                quote per token
pool_to_sale_ratio = Qlp * B / (L * R)
original_supply_valuation = price * S       quote
fill_rate = R / C                          successful total commitments C >= R
wallet_tokens ≈ B * c / C                  wallet accepted commitment c
wallet_overflow_refund ≈ c * (C - R) / C
```

Nominal pool price below sale price creates an adverse initial reference for buyers. A higher nominal price is not guaranteed profit: depth, vesting, fees and immediate trades matter. Do not fund a desired chart price by silently removing treasury runway or pool depth.

Use the worked presale example in [Teaching launch prices](pricing.md) to connect these formulas to a buyer's experience. A late protocol-token fee change requires recalculating buyer allocation and sale price. For a miss, model zero buyer tokens and full commitment refunds after settlement/claims; this is a different outcome, not a negative fill calculation.

## Curve prices and migration

For initial curve tokens `M0`, virtual quote `V`, real reserve `Q` and target `T`, in consistent whole units:

```text
opening_spot = V / M0
buy_only_remaining_at_target ≈ M0 * V / (V + T)
terminal_spot ≈ (V + T) / buy_only_remaining_at_target
nominal_pool_price = allocated_real_pool_quote / reserved_pool_tokens
migration_price_gap = nominal_pool_price / terminal_spot - 1
```

These are continuous buy-only approximations. Fees change the gross spend and tokens buyers receive; integer paths, sells and sell burn affect the realized state. Use exact state/trade previews for a concrete scenario. Distinguish gross curve release, buyer net tokens, fees, unsold disposal and recorded versus economically accessible supply.

Model graduation price and pool price together. Matching nominal prices does not prove sufficient depth or executable continuity; venue ticks, actual deposits and residuals matter. A large pool premium may encourage selling; a discount exposes holders to a lower reference. Quantify the difference and the funding tradeoff. Graduation allocations are conditional on reaching the target and successful migration; do not budget them as money the team already has.

Show original-supply valuation separately from current-supply valuation after burns. Define a launch float policy explicitly: unlocked recipient/buyer tokens, pool tokens, fee inventory and spendable treasury inventory. Report components so LP holdings or controlled treasury do not disappear behind an ambiguous “circulating” number. FDV is a price-times-supply reference, not cash raised or exit liquidity.

## Vesting: specify the actual promise

For each beneficiary/cohort record the asset, total amount, immediately available amount, schedule start, cliff, step duration, step count, final unlock, cancellation/transfer authority and enforcing contract. State whether “48 months” includes or follows a cliff. Fixed millisecond periods differ from calendar months; define the convention before creating timestamps.

For Blast presale native schedules with amount `A`, start `s`, cliff duration `c`, period duration `p`, count `n`, elapsed `e = t − s`:

```text
vested = 0                                when e < c
vested = A                                when e >= p * n
vested = floor(A * floor(e / p) / n)       otherwise
claimable = vested - already_released
```

The cliff gates accrual from the **start**; it does not restart accrual. A 48-step schedule with a 12-step cliff releases 12/48 = 25% at the cliff, then 1/48 per step. If the goal is zero cliff catch-up and 36 releases after the cliff, translating that wording into the same parameters fails. Identify a verified separate arrangement or change the requested promise explicitly. A zero cliff alone does not give immediate tokens; the first whole step must pass.

Buyer schedules start on each buyer's claim, which anyone may relay, so a delayed claim shifts that buyer's unlocks. Recipient schedules start on migration. Show these as relative schedules until the anchors are known; calendar projections use labeled assumed anchors. Presale native schedules are irrevocable with fixed beneficiaries, even though the utility package also exposes separately constructed cancelable schedules.

For team/early investors, use comparable vesting precedents to discuss retention and concentration. For buyers, balance tradable float and expectations against unlock pressure. For ecosystem grants, match release to credible spending needs. A milestone-based grant or partial upfront unlock is a design requirement, not a field that can be assumed to exist. On curves, native migration allocations contain no vesting; classify external custody/composition separately.

## Stress tests and completion

Choose cases that can change the decision:

- Presale: target miss, exact fill, overflow, and failure to migrate by deadline. Include late hard-cap activation if chosen.
- Curve: slow or absent graduation, a representative sell against real reserves, and pool migration with a price gap. Separate buy-only projections from simulated trade histories.
- Both: base versus lower quote-asset value, zero fee revenue, immediately spendable insider/treasury concentration, and clustered vesting cliffs. Include first-trade/representative-sale execution when exact venue previews are available; otherwise name the missing depth check instead of claiming a slippage result.

Report liquid token components at launch, 30/90/180/365 days and major cliffs when those horizons matter. Compare each large unlock to pre-unlock float and available depth; unlock pressure is a scenario, not a prediction of selling. Keep buyer claim cohorts separate. Reject math that spends virtual reserves, overflow refunds, accrued fees twice, or LP reserves as treasury runway.

Finish when all ledgers reconcile, the worst relevant cash deficit and unlock event are visible, and every minimum goal either survives or has an explicit tradeoff. Label the result a draft until source, release and live-policy checks needed for execution are complete.
