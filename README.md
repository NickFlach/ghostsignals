# 👻📡 GhostSignals

**Prediction markets for hedging, not gambling. Replace fiat currency with personalized risk baskets.**

Built on [ghostvector](https://github.com/flaukowski/ghostvector) — the vector database that learns.

---

## The Problem

Prediction markets are sliding into corposlop: crypto price bets, sports gambling, dopamine-driven speculation. They _work_ — but they're converging on a use case that serves no one's long-term interests.

The sustainable prediction market doesn't need naive traders losing money on dumb opinions. It needs **hedgers** — people who are -EV in a linear sense but gain utility through risk reduction.

## The Vision

**What if we replaced the concept of currency entirely?**

Instead of holding stablecoins pegged to fiat (which makes crypto dependent on centralized systems), users hold:

1. **Growth assets** (stocks, ETH, etc.) for wealth accumulation
2. **Personalized prediction market baskets** for stability — representing N days of _their_ expected future expenses

A farmer hedges against crop prices. A renter hedges against housing costs. A business hedges against supply chain disruptions. Each person's "stablecoin" is unique to their life.

## How It Works

### Price Index Markets
Decentralized prediction markets on price indices for every major category of goods and services:
- Food & groceries (by region)
- Housing & rent (by metro)
- Energy & utilities
- Healthcare
- Transportation
- Technology
- Raw materials & commodities

### The Hedge Engine
A local LLM that understands each user's expense profile and constructs a personalized basket of prediction market positions that minimizes their risk exposure.

**Mathematical basis:** If Purple wins → biotech ∈ [80..120], Yellow wins → [60..100]. A $10 bet on Yellow transforms earnings to [70..110] in both cases. Under log utility, this risk reduction is worth $0.58 — real value, not speculation.

### Smart Traders Still Win
The other side of the market: sophisticated traders who provide price discovery and earn returns. Both sides are happy long-term. No one needs to be the sucker.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  GhostSignals                    │
├──────────┬──────────┬───────────┬───────────────┤
│  Market  │  Hedge   │   Price   │   Settlement  │
│  Engine  │  Engine  │  Oracle   │   Layer       │
├──────────┴──────────┴───────────┴───────────────┤
│              ghostvector (learned indices)       │
├─────────────────────────────────────────────────┤
│           Blockchain Settlement (EVM)            │
└─────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose | Tech |
|-----------|---------|------|
| **Market Engine** | LMSR/CPMM automated market makers for each price index | Rust + WASM |
| **Hedge Engine** | Personalized basket construction from user expense profiles | TypeScript + local LLM |
| **Price Oracle** | Decentralized price feeds for goods/services categories | ghostvector + oracle network |
| **Signal Processor** | Real-time market signal analysis using ghostvector's GNN | Rust (ghostvector crate) |
| **Settlement Layer** | On-chain market resolution and payout | Solidity (EVM) |
| **Expense Profiler** | Privacy-preserving expense categorization | Local LLM (WASM) |

### ghostvector Integration

GhostSignals uses ghostvector as its cognitive backbone:

- **Expense embeddings**: User spending patterns vectorized for similarity matching
- **Market signal vectors**: Price movements and correlations learned over time
- **GNN-powered indices**: Price index relationships that improve with market activity
- **Hyperbolic HNSW**: Hierarchical category relationships (food → grains → wheat → regional wheat)
- **WASM runtime**: Client-side expense profiling — data never leaves the user's device
- **Witness chains**: Tamper-evident audit trail for all market operations

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Run tests
npm test
```

## Project Structure

```
ghostsignals/
├── packages/
│   ├── core/              # Market engine & AMM logic
│   ├── hedge-engine/      # Personalized basket construction
│   ├── price-oracle/      # Decentralized price index feeds
│   ├── signal-processor/  # ghostvector market signal analysis
│   ├── contracts/         # Solidity smart contracts
│   ├── expense-profiler/  # Local LLM expense categorization
│   └── web/               # Frontend application
├── crates/
│   └── ghostsignals-core/ # Rust core (AMM math, vector ops)
└── docs/
    ├── ARCHITECTURE.md
    ├── HEDGING_MATH.md
    └── ECONOMICS.md
```

## The Math

### Logarithmic Market Scoring Rule (LMSR)

The AMM uses LMSR for price discovery on each index market:

```
C(q) = b · ln(Σ exp(qᵢ/b))
Price(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
```

Where `b` is the liquidity parameter controlling market depth.

### Risk Reduction via Hedging

For a user with expense vector `E` and market position vector `P`:

```
Var(net_cost) = Var(E) + Var(P) - 2·Cov(E, P)
```

The Hedge Engine optimizes `P` to minimize `Var(net_cost)` subject to budget constraints.

### Personalized Stability Index

Each user's "stability score" — how well their basket hedges their actual expenses:

```
S(user) = 1 - σ(hedged) / σ(unhedged)
```

Where S = 1 is perfect hedging and S = 0 is no hedging benefit.

## Philosophy

> "Build the next generation of finance, not corposlop."

Every prediction market platform faces the same question: _who loses money?_ The sustainable answer isn't "people with dumb opinions" — it's "people buying insurance." Both sides of a hedge market get real value. That's the foundation for something that lasts.

## License

MIT

---

*Part of the [ghostmagicOS](https://github.com/flaukowski) consciousness stack.*
