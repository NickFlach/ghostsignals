# Hedging Mathematics

## Core Concept

A user has expenses **E** across categories (food, housing, energy, etc.). Prices in these categories are volatile. The goal is to construct a portfolio of prediction market positions **P** such that:

```
Var(net_cost) = Var(E + P) is minimized
```

Expanding:

```
Var(E + P) = Var(E) + Var(P) + 2·Cov(E, P)
```

Since we want positions **negatively correlated** with expenses:

```
Cov(E, P) < 0  →  Var(E + P) < Var(E)
```

The **stability score** measures how much variance we've eliminated:

```
S = 1 − σ(hedged) / σ(unhedged) = 1 − √(Var(E + P)) / √(Var(E))
```

- S = 0: no hedging benefit
- S = 1: perfect hedge (zero variance)
- S = 0.78: 78% of expense volatility eliminated

## LMSR (Logarithmic Market Scoring Rule)

### Cost Function

```
C(q) = b · ln(Σᵢ exp(qᵢ / b))
```

Where:
- **q** = vector of shares outstanding per outcome
- **b** = liquidity parameter (higher = more liquid, lower spreads)
- **C(q)** = total cost to reach share state **q**

### Price (Probability)

The price of outcome i equals its implied probability:

```
P(i) = exp(qᵢ / b) / Σⱼ exp(qⱼ / b)
```

Properties:
- All prices sum to 1: Σᵢ P(i) = 1
- Prices are always in (0, 1)
- Marginal cost of buying outcome i equals P(i)

### Trade Cost

Cost to buy Δq shares of outcome i:

```
cost = C(q + Δqᵢ) − C(q)
```

Proceeds from selling Δq shares:

```
proceeds = C(q) − C(q − Δqᵢ)
```

### Market Maker Loss Bound

The maximum loss for the LMSR market maker is:

```
max_loss = b · ln(n)
```

where n = number of outcomes. This is funded by the initial liquidity.

### On-Chain Implementation

The Solidity `PredictionMarket.sol` implements LMSR with:

1. **WAD arithmetic** (18 decimal fixed-point)
2. **Log-sum-exp trick** for numerical stability:
   ```
   C(q) = max(q) + b · ln(Σᵢ exp((qᵢ − max(q)) / b))
   ```
   This prevents exp() overflow since all exponent arguments are ≤ 0.
3. **Taylor series** for exp(x) where x ∈ [0, ln(2)):
   ```
   exp(x) ≈ 1 + x + x²/2 + x³/6 + x⁴/24 + x⁵/120 + x⁶/720
   ```
4. **Padé approximant** for ln(x) where x ∈ [1, 2):
   ```
   ln(x) ≈ 2y(1 + y²/3 + y⁴/5 + y⁶/7)  where y = (x−1)/(x+1)
   ```

## Portfolio Optimization

### Mean-Variance Hedging

Given expense exposure vector **w** and market return covariance matrix **Σ**, the optimal hedge portfolio **h** minimizes:

```
min_h  w'Σw + h'Σh + 2w'Σh
subject to:
  Σhᵢ ≤ budget
  hᵢ ≥ 0  (long-only)
  max(hᵢ) / Σhᵢ ≤ concentration_limit
```

The current implementation uses a **greedy allocation** approach:

1. Rank expense categories by exposure (largest first)
2. For each category, find markets with negative correlation
3. Allocate budget proportional to exposure
4. Select best-scoring market per category

### Hedge Ratio

For each position, the hedge ratio measures effectiveness:

```
hedge_ratio = |Corr(expense_category, market_position)|
```

Higher hedge ratio = position moves more inversely with your expenses.

### Rebalancing

Rebalancing is triggered when position drift exceeds threshold:

```
drift = |actual_weight − target_weight|
trigger when: max(drift) > rebalance_threshold
```

Cost-benefit check before rebalancing:

```
rebalance if: projected_stability_improvement > rebalance_cost
```

## Price Oracle Aggregation

### Robust Aggregation

Price observations from multiple sources are aggregated using:

1. **Outlier filtering** via Median Absolute Deviation (MAD):
   ```
   MAD = median(|xᵢ − median(x)|)
   outlier if: |xᵢ − median(x)| / MAD > threshold
   ```

2. **Aggregation methods:**
   - Median (default, robust to outliers)
   - Weighted mean (by source reliability)
   - Geometric mean (for ratio-scale data)

### Anomaly Detection

Z-score based detection against historical baseline:

```
z = (current − mean(historical)) / std(historical)
anomaly if: |z| > sensitivity_threshold (default 2.5σ)
```

## Expense Profiling

### Category Mapping

Granular expense categories map to market categories:

```
groceries, dining_out, beverages → food
rent, mortgage, utilities → housing
fuel, vehicle_insurance → transport
electricity, gas → energy
health_insurance, medications → healthcare
internet, mobile → tech
clothing, household_goods → materials
```

### Volatility Estimation

Per-category base volatilities (annualized):

| Category | Base σ | Rationale |
|----------|--------|-----------|
| Food | 15% | Seasonal, weather-dependent |
| Housing | 5% | Sticky prices, long contracts |
| Energy | 25% | Highly volatile, geopolitical |
| Healthcare | 10% | Regulated but rising |
| Transport | 20% | Oil-linked |
| Tech | 12% | Deflationary trend |
| Materials | 18% | Commodity-linked |

Adjusted by user's fixed/variable expense ratio:

```
adjusted_σ = base_σ · (0.5 + variable_ratio · 0.5)
```
