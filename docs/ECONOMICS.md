# ghostsignals Economics

## The Problem

Fiat currency is a bad store of value for individuals because:

1. **Inflation is not uniform** — CPI is an average. Your personal inflation rate depends on what you buy. If you spend 40% on rent in SF, your inflation is very different from someone in rural Texas.

2. **No hedging tools for consumers** — Institutions hedge with futures, options, swaps. Consumers have nothing. You can't buy wheat futures to hedge your grocery bill.

3. **Savings accounts lose** — At 4% interest vs. 6% personal inflation, your purchasing power declines. You're getting poorer by saving.

## The Solution: Personal Risk Baskets

Replace "saving dollars" with "hedging expenses":

```
Traditional:  Income → Savings Account → Hope prices don't rise
ghostsignals: Income → Expense Profile → Hedging Basket → Stability
```

A **hedging basket** is a portfolio of prediction market positions constructed to move inversely with your personal expenses. When grocery prices rise, your food market positions gain value, offsetting the cost increase.

## How It Works

### 1. Expense Profiling

Users input their spending (or import transactions). The system categorizes expenses:

| Category | Monthly Spend | Volatility | Hedgeable? |
|----------|--------------|------------|------------|
| Groceries | $600 | 15% | ✅ Food markets |
| Rent | $1,800 | 5% | ✅ Housing markets |
| Electricity | $120 | 25% | ✅ Energy markets |
| Fuel | $200 | 20% | ✅ Transport markets |
| Health insurance | $350 | 10% | ✅ Healthcare markets |
| Netflix | $15 | 0% | ❌ Fixed price |

### 2. Market Selection

For each volatile expense category, the optimizer selects prediction markets with **negative correlation** to that expense. Example:

- "Will food prices in US West increase >5% this quarter?" — Buying "Yes" hedges against grocery price increases
- "Will housing costs in California stay stable?" — Buying "No" hedges against rent increases

### 3. Position Sizing

Budget allocation follows expense exposure:

```
category_allocation = (category_monthly_spend / total_monthly_spend) × hedging_budget
```

With adjustments for:
- Volatility (higher vol → larger allocation)
- Correlation strength (weaker correlation → smaller allocation)
- Liquidity (illiquid markets → avoid or reduce)

### 4. Continuous Rebalancing

Positions drift as prices move. The system monitors and rebalances when:
- Position weights deviate from targets by >5%
- Stability score drops below threshold
- New expense data changes the profile
- Market structure changes (new markets, resolutions)

## Revenue Model

### Market Creation Fees
- Fee to create a new prediction market (currently 0.01 ETH)
- Covers deployment gas and registry

### Trading Spreads
- LMSR naturally has a bid-ask spread proportional to 1/b
- Higher liquidity parameter = tighter spreads = lower implicit fees
- Spread revenue accrues to the market maker (initial liquidity provider)

### Management Fees
- 1% annual fee on hedging basket value
- Collected monthly from user collateral
- Funds platform operations and oracle maintenance

### Resolution Fees
- Small fee on market resolution
- Incentivizes accurate oracle reporting

## Market Categories

Markets are organized by the expense categories they hedge:

| Market Category | Example Markets | Typical Resolution |
|----------------|----------------|-------------------|
| Food | Regional food price indices, specific commodity prices | Quarterly |
| Housing | Metro-area housing cost indices, rent indices | Semi-annual |
| Energy | Electricity rates, natural gas prices, fuel costs | Monthly-Quarterly |
| Healthcare | Insurance premium trends, drug price indices | Annual |
| Transport | Fuel costs, public transit fares, vehicle costs | Quarterly |
| Tech | Internet/mobile plan costs, device prices | Semi-annual |
| Materials | Clothing indices, household goods costs | Quarterly |

## Economic Invariants

### LMSR Bounded Loss
The market maker's maximum loss is `b · ln(n)` where n = number of outcomes. This is funded by the initial liquidity deposit and guarantees markets can always be resolved.

### Probabilities Sum to 1
LMSR prices always sum to 1, maintaining the coherence of the probability distribution. No arbitrage between outcomes within a single market.

### Zero-Sum Settlement
At resolution, winning shares pay 1 unit each. Total payout equals total shares on the winning outcome. The market maker absorbs the difference between total fees collected and total payouts.

### Hedging Is Not Speculation
The platform is designed so that:
- Users hold positions **correlated with their expenses**, not random events
- Stability score (not return) is the primary optimization target
- Rebalancing maintains hedge ratios, not profit maximization
- Position sizes are bounded by expense exposure, not by conviction

## Comparison to Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| Savings account | Simple, safe | Loses to inflation |
| Index funds | Long-term growth | No expense correlation |
| Commodity futures | Direct hedge | Complex, high minimums, margin calls |
| TIPS bonds | Inflation-linked | Only tracks CPI average, not personal |
| **ghostsignals** | **Personal, granular, automated** | **New, requires liquidity** |

## Open Questions

1. **Bootstrapping liquidity** — Markets need initial liquidity. Who provides it? Market makers? Platform subsidies? Liquidity mining?

2. **Oracle reliability** — Price data must be accurate for markets to resolve correctly. Multiple oracle sources with outlier filtering help but don't eliminate risk.

3. **Regulatory classification** — Are personalized hedging markets securities? Derivatives? Betting contracts? Jurisdiction matters.

4. **Correlation stability** — Historical correlations between expenses and market positions may not hold in extreme scenarios (pandemic, war, supply chain disruption).

5. **User education** — Convincing people to hedge rather than save or invest requires a shift in financial thinking.
