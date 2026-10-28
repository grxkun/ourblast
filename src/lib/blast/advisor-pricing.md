# Teaching launch prices

Read for price education or any launch plan. The goal is for a founder to understand where the price comes from, which choices move it, and what a buyer can actually receive. These examples illustrate source mechanics, not verified live fees, product availability, recommended allocations or future trading prices. Reuse the general formulas in [Tokenomics design](tokenomics.md) for the team's model.

## Name the stage first

“Launch price” is ambiguous. Label the stages instead of presenting one number:

| Stage | Presale | Bonding curve |
| --- | --- | --- |
| First participation | One sale price: successful target divided by buyer tokens | Opening spot price: virtual quote divided by initial curve inventory |
| During participation | Price per filled token stays the same; fill/refund depends on commitments | Price changes with buys and sells; an order's average differs from the displayed spot |
| Immediately before pool launch | Buyers' entry reference remains the sale price | Last curve spot follows actual reserves when the target is reached |
| Initial DEX pool | Nominal ratio of allocated real quote to allocated LP tokens | Same ratio principle, independently set from the curve's last price |
| After pool launch | Market trades, depth, fees and unlocks determine executable prices | Market trades, depth, fees and unlocks determine executable prices |

Use the quote asset in every price: “0.00025 SUI per token.” A token count, a SUI price and a USD valuation are different units. If a USD illustration is useful, state the assumed SUI/USD rate and its date; a token's SUI price can stay constant while its USD value changes.

Teach with one participant, then the pool, then the valuation. Show concrete amounts first and the ratio second. Use a small table, diagram or interactive model if it makes the relationship easier to see. Tailor the depth to the team's knowledge and stop to resolve confusion before prescribing percentages.

## Presale: the same sale can open its pool at a different ratio

Assume a 1-billion-token supply and a **100,000 SUI successful target**:

| Destination | Tokens | Share of supply | SUI at migration | Share of target |
| --- | ---: | ---: | ---: | ---: |
| Buyers | 400,000,000 | 40% | — | — |
| Pool | 200,000,000 | 20% | 60,000 | 60% |
| Protocol, assumed | 10,000,000 | 1% | 2,000 | 2% |
| Team | 200,000,000 | 20% | 0 | 0% |
| Treasury | 190,000,000 | 19% | 38,000 | 38% |
| Total | 1,000,000,000 | 100% | 100,000 | 100% |

**What the buyer pays.** Buyers jointly exchange 100,000 SUI for 400 million tokens. Each filled token therefore costs **0.00025 SUI**. At exact fill, 100 SUI buys 400,000 tokens. This is the gross filled-commitment price; show any additional applicable user costs separately.

If the community instead commits 400,000 SUI, a wallet committing 400 SUI is filled 25%: 100 SUI buys its 400,000 tokens, and 300 SUI is refunded when it claims. Paying 400 SUI up front does not mean its final cost is 400 SUI. Overflow does not increase the successful target or treasury payout. Atomic rounding and final-claim dust follow the contract.

**What sets the pool's starting ratio.** The pool receives 60,000 SUI and 200 million tokens, so its nominal opening price is **0.00030 SUI per token**. That is **20% above** the sale price. Doubling the pool's token allocation while keeping its SUI fixed would halve that price. Halving its SUI while keeping tokens fixed would also halve the price, while reducing real quote backing.

**What the 20% means.** At the nominal pool ratio, 400,000 tokens have a displayed reference value of 120 SUI. That is not a guarantee the buyer can sell them for 120 SUI: a sale moves the pool price, incurs applicable fees and may be blocked by vesting. Determine executable proceeds through the actual venue, amount, position and current state. A vested buyer cannot necessarily trade at the first pool ratio.

**What the team can spend.** Treasury receives 38,000 SUI, assuming it is unvested. With 2,000 SUI upfront expenses and 6,000 SUI monthly costs, that funds **six months**. The target is not all available to run the business; pool SUI and protocol fees already have other destinations. If the required runway is longer, revise the economics instead of treating the price premium as funding.

**What the valuation means.** Using the original billion-token supply, the sale reference implies **250,000 SUI** and the nominal pool ratio implies **300,000 SUI**. These price-times-supply references are not money raised, liquid reserves or aggregate cash-out value. Define the unlocked float separately.

## Curve: opening price, average purchase and pool price are separate

For a clean arithmetic example, assume:

- One billion original tokens: curve inventory 60%, pool reserve 20%, protocol 1%, project treasury 19%.
- Virtual quote of 1,000 SUI and a graduation target of **3,000 real SUI**.
- At graduation: real quote to the pool 80%, protocol 1%, project treasury 19%.
- **Zero curve trade fees and zero sell burn**, with only buys. These simplify the example; actual configured fees and trade history must be modeled separately.

| Moment | Real quote reserve | Curve tokens remaining | Marginal spot, SUI/token |
| --- | ---: | ---: | ---: |
| Opening | 0 SUI | 600,000,000 | ≈ 0.0000016667 |
| After a 100 SUI buy | 100 SUI | ≈ 545,454,545.45 | ≈ 0.0000020167 |
| Target reached | 3,000 SUI | ≈ 150,000,000 | ≈ 0.0000266667 |

The first buyer spends 100 SUI and receives about 54.545 million tokens. Its average entry is **≈ 0.0000018333 SUI/token**, already 10% above the opening spot because the buy moves the price. The displayed spot after its purchase is another number.

To isolate the effect of fees, repeat that first purchase from the same initial reserves with **assumed 1% quote and 1% token fees**: 1 SUI is a fee, 99 SUI enters the reserve, the curve releases about 54.049 million gross tokens, and the token fee leaves about **53.509 million net tokens**. The buyer still spends 100 SUI, so its effective entry is **≈ 0.0000018689 SUI/token**. Dividing by gross tokens would hide part of its cost. Use actual quote spent, excluding returned input, divided by net tokens delivered; show network/app costs separately when applicable. This fee comparison is separate from the no-fee graduation projection below. An opening-round participant shares the pot's net output and refund rather than receiving an independent first-trade price.

Virtual quote explains the opening price even though the initial real reserve is zero. It does not give the team 1,000 SUI to spend or fund a 1,000 SUI redemption guarantee. Graduation requires the full **3,000 real SUI net of curve quote fees**, not a displayed valuation or accumulated gross trading volume. Sells can reduce progress. The projected final price assumes the stated buy-only path and no rounding effects.

**Check the jump into the pool.** The original plan reserves 200 million pool tokens and assigns 2,400 real SUI to the pool. Its nominal pool price is **0.000012 SUI/token**, which is **55% below** the example's final curve spot. A rising curve does not automatically continue at its last price in the DEX. Show this discontinuity before recommending the plan.

To match that terminal ratio in this simplified example, 2,400 SUI would pair with **90 million tokens**, or **9%** of original supply. A revised token split could be curve 60%, pool 9%, protocol 1%, treasury 30%; it still totals 100%. This illustrates a tradeoff, not a recommendation: changing reserved LP tokens shifts both price and allocation/concentration, and the real venue still needs deposit and depth checks. Pool SUI remains 2,400, treasury receives 570, and protocol receives 30; virtual quote appears in none of those payouts.

Under the buy-only assumption, about 450 million tokens leave the original curve inventory. About 150 million remain for disposal at migration; they are not all sold and are not added to the separately reserved pool tokens. Explain burn-only versus fixed-supply disposal when computing current-supply valuation. Market prices after migration remain unknown.

## What a pricing explanation must resolve

Use the team's actual inputs when known; otherwise keep assumptions visible. For a full plan, show the relevant stage prices, their percentage gaps, a representative buyer's effective entry, real pool funding and net spendable treasury. Ask which goal should govern when price, liquidity depth and runway conflict.

Explain a setting by changing one variable while holding the others fixed: more buyer tokens lowers the sale price for a fixed target; more virtual quote raises the opening curve spot without adding liquidity; more LP tokens lowers the nominal pool ratio for fixed pool quote. A large supply and tiny unit price do not by themselves make a launch cheaper or more valuable.

Separate a **spot reference**, an order's **average execution**, and a **minimum output** used to bound slippage. A price set by initial reserves is not a lasting price floor or guaranteed return. Explain how fees, vesting, sells and pool liquidity affect what the participant can actually do. When an executable quote is unavailable, label that check as missing rather than inventing proceeds.
