import Decimal from 'decimal.js';
import { MarketEngine } from '@ghostsignals/core';
import { HedgeEngine, ExpenseProfiler, PortfolioOptimizer } from '@ghostsignals/hedge-engine';
import { PriceOracle, CategoryTaxonomy } from '@ghostsignals/price-oracle';
import { SignalProcessor } from '@ghostsignals/signal-processor';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  settings: {
    riskTolerance: number;
    hedgingBudget: number;
    autoRebalance: boolean;
    rebalanceThreshold: number;
  };
}

export interface AppContext {
  marketEngine: MarketEngine;
  hedgeEngine: HedgeEngine;
  priceOracle: PriceOracle;
  signalProcessor: SignalProcessor;
  users: Map<string, UserProfile>;
}

export function createAppContext(): AppContext {
  const marketEngine = new MarketEngine();
  const taxonomy = new CategoryTaxonomy();
  const priceOracle = new PriceOracle(taxonomy);
  const signalProcessor = new SignalProcessor();

  const hedgeEngine = new HedgeEngine(marketEngine, {
    defaultRiskTolerance: 0.5,
    defaultRebalanceThreshold: 0.05,
    maxPositionsPerBasket: 20,
    minHedgingBudget: new Decimal(100),
    rebalanceCheckFrequencyHours: 24,
  });

  return {
    marketEngine,
    hedgeEngine,
    priceOracle,
    signalProcessor,
    users: new Map(),
  };
}
