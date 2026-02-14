# ghostsignals Architecture

## Vision

Prediction markets for **hedging**, not gambling. Replace fiat currency with personalized risk baskets that protect against real-world price volatility in the categories you actually spend on.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (web)                          │
│   Dashboard │ MarketBrowser │ HedgeBasket │ ExpenseSetup        │
└──────────┬──────────────────────────────────────────────────────┘
           │ REST + WebSocket
┌──────────▼──────────────────────────────────────────────────────┐
│                       API Service Layer                         │
│   /markets │ /trading │ /users │ /baskets │ /prices             │
└──┬─────────────┬──────────────┬────────────────┬────────────────┘
   │             │              │                │
┌──▼───┐   ┌────▼────┐   ┌────▼─────┐   ┌──────▼──────┐
│ Core │   │  Hedge  │   │  Price   │   │   Signal    │
│Engine│   │  Engine │   │  Oracle  │   │  Processor  │
└──┬───┘   └────┬────┘   └────┬─────┘   └──────┬──────┘
   │             │              │                │
┌──▼─────────────▼──────────────▼────────────────▼────────────────┐
│                    Smart Contracts (EVM)                         │
│   PredictionMarket │ MarketFactory │ HedgeVault                 │
└─────────────────────────────────────────────────────────────────┘
```

## Package Map

| Package | Purpose | Key Classes |
|---------|---------|-------------|
| `@ghostsignals/core` | LMSR AMM, market engine, order book | `MarketEngine`, `LMSREngine`, `OrderBook` |
| `@ghostsignals/hedge-engine` | Expense profiling, portfolio optimization | `HedgeEngine`, `ExpenseProfiler`, `PortfolioOptimizer` |
| `@ghostsignals/price-oracle` | Price aggregation, anomaly detection | `PriceOracle`, `CategoryTaxonomy` |
| `@ghostsignals/signal-processor` | Market signals, correlations, efficiency | `SignalProcessor` |
| `@ghostsignals/contracts` | Solidity smart contracts | `PredictionMarket`, `MarketFactory`, `HedgeVault` |
| `@ghostsignals/expense-profiler` | Standalone expense analysis | (Shared types) |
| `@ghostsignals/api` | REST/WebSocket API | Hono routes |
| `@ghostsignals/web` | React frontend | Dashboard, MarketBrowser, HedgeBasket, ExpenseSetup |

## Data Flow

### 1. Expense Profile → Hedging Basket

```
User Transactions → ExpenseProfiler.createProfileFromTransactions()
                        ↓
                  ExpenseProfile { expenses[], riskTolerance, hedgingBudget }
                        ↓
              PortfolioOptimizer.optimizeBasket()
                        ↓
              HedgingBasket { positions[], stabilityScore }
```

### 2. Market Trading

```
TradeRequest → MarketEngine.executeTrade()
                    ↓
             ┌──────┴──────┐
             │             │
         AMM Trade    Limit Order
        (LMSREngine)  (OrderBook)
             │             │
             └──────┬──────┘
                    ↓
              Trade + Updated Market
```

### 3. Price Oracle Pipeline

```
External Sources → PriceOracle.submitObservations()
                        ↓
                   Outlier Filtering (MAD)
                        ↓
                   Aggregation (median/mean/weighted)
                        ↓
                   PriceIndexPoint
                        ↓
                   ┌────┴────┐
                   │         │
              Composite   Anomaly
              Indices     Detection
```

### 4. On-Chain Settlement

```
MarketFactory.createMarket() → deploys PredictionMarket
                                      ↓
Users buy/sell shares via PredictionMarket (LMSR on-chain)
                                      ↓
Oracle resolves → PredictionMarket.resolve()
                                      ↓
Users claim winnings → PredictionMarket.claimWinnings()

HedgeVault manages multi-market positions as "baskets"
with automated rebalancing and management fees.
```

## Technical Stack

- **Runtime:** Node.js 18+, TypeScript 5.7
- **Build:** pnpm workspaces + Turborepo
- **API:** Hono (lightweight, fast)
- **Frontend:** React + Vite + TailwindCSS + React Query
- **Contracts:** Solidity 0.8.19, Hardhat, OpenZeppelin
- **Math:** decimal.js for arbitrary-precision financials
- **Validation:** Zod schemas throughout
- **Testing:** Vitest

## Key Design Decisions

1. **LMSR over CPMM**: Logarithmic Market Scoring Rule provides bounded loss for the market maker and natural probability interpretation. Better suited for prediction markets than constant-product (Uniswap-style) AMMs.

2. **Hybrid AMM + Order Book**: AMM provides guaranteed liquidity; order book allows price improvement for sophisticated traders. Trades route to whichever gives better execution.

3. **On-chain LMSR uses fixed-point math**: WAD (18 decimals) arithmetic with Taylor series exp() and Padé approximant ln(). Log-sum-exp trick prevents overflow.

4. **Stability Score as primary metric**: S = 1 − σ(hedged)/σ(unhedged). Users optimize for stability, not return. This is hedging, not speculation.

5. **Expense-first design**: Markets exist to serve expense hedging. Categories map from granular expenses (groceries, rent, fuel) to market categories (food, housing, transport).
