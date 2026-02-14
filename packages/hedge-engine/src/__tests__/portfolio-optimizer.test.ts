import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { PortfolioOptimizer, type MarketData } from '../portfolio-optimizer.js';
import type { ExpenseProfile } from '../schemas.js';
import type { Market } from '@ghostsignals/core';

function makeMarket(id: string, category: string, region: string): Market {
  return {
    id,
    title: `${category} index`,
    description: `Test market for ${category}`,
    category: category as any,
    region: region as any,
    type: 'price_index',
    state: 'active',
    outcomes: [
      { id: `${id}_up`, name: 'Up', probability: new Decimal('0.33'), shares: new Decimal(100) },
      { id: `${id}_flat`, name: 'Flat', probability: new Decimal('0.34'), shares: new Decimal(100) },
      { id: `${id}_down`, name: 'Down', probability: new Decimal('0.33'), shares: new Decimal(100) },
    ],
    liquidity: new Decimal(1000),
    liquidityParameter: new Decimal(100),
    createdAt: new Date(),
  };
}

function makeMarketData(market: Market): MarketData {
  return {
    market,
    expectedReturn: new Decimal(0),
    volatility: new Decimal(0.2),
    correlationWithCategory: new Map([
      [market.category as any, new Decimal(-0.3)],
    ]),
    liquidityScore: new Decimal(0.8),
    currentPrice: new Decimal(0.33),
  };
}

const profile: ExpenseProfile = {
  userId: 'test',
  name: 'Test',
  expenses: [
    { id: '1', name: 'Groceries', category: 'groceries', amount: new Decimal(600), frequency: 'monthly', region: 'us-west', isFixed: false },
    { id: '2', name: 'Rent', category: 'rent', amount: new Decimal(1800), frequency: 'monthly', region: 'us-west', isFixed: true },
    { id: '3', name: 'Electricity', category: 'electricity', amount: new Decimal(120), frequency: 'monthly', region: 'us-west', isFixed: false },
  ],
  totalMonthlyExpenses: new Decimal(2520),
  riskTolerance: 0.5,
  hedgingBudget: new Decimal(500),
  rebalanceThreshold: 0.1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PortfolioOptimizer', () => {
  const optimizer = new PortfolioOptimizer();

  describe('optimizeBasket', () => {
    it('should return feasible result with relevant markets', () => {
      const markets = [
        makeMarketData(makeMarket('m1', 'food', 'us-west')),
        makeMarketData(makeMarket('m2', 'housing', 'us-west')),
        makeMarketData(makeMarket('m3', 'energy', 'us-west')),
      ];

      const result = optimizer.optimizeBasket(profile, markets, {
        maxPositionsPerCategory: 3,
        minPositionSize: new Decimal(10),
        maxPositionSize: new Decimal(1000),
        maxConcentration: 0.3,
        targetVolatilityReduction: 0.5,
        rebalanceCostThreshold: new Decimal(5),
      });

      expect(result.feasible).toBe(true);
      expect(result.positions.length).toBeGreaterThan(0);
      expect(result.totalCost.gt(0)).toBe(true);
      expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return infeasible with no matching markets', () => {
      const result = optimizer.optimizeBasket(profile, [], {
        maxPositionsPerCategory: 3,
        minPositionSize: new Decimal(10),
        maxPositionSize: new Decimal(1000),
        maxConcentration: 0.3,
        targetVolatilityReduction: 0.5,
        rebalanceCostThreshold: new Decimal(5),
      });

      expect(result.feasible).toBe(false);
      expect(result.positions.length).toBe(0);
    });

    it('should respect budget constraints', () => {
      const markets = [
        makeMarketData(makeMarket('m1', 'food', 'us-west')),
        makeMarketData(makeMarket('m2', 'housing', 'us-west')),
      ];

      const result = optimizer.optimizeBasket(profile, markets, {
        maxPositionsPerCategory: 3,
        minPositionSize: new Decimal(10),
        maxPositionSize: new Decimal(1000),
        maxConcentration: 0.3,
        targetVolatilityReduction: 0.5,
        rebalanceCostThreshold: new Decimal(5),
      });

      // Total cost should not exceed budget
      expect(result.totalCost.lte(profile.hedgingBudget)).toBe(true);
    });
  });

  describe('calculateStabilityScore', () => {
    it('should return 0 for zero unhedged volatility', () => {
      const score = optimizer.calculateStabilityScore(new Decimal(0), new Decimal(0));
      expect(score.toNumber()).toBe(0);
    });

    it('should return positive score when hedging reduces volatility', () => {
      const score = optimizer.calculateStabilityScore(new Decimal(1), new Decimal(0.5));
      expect(score.toNumber()).toBe(0.5);
    });

    it('should return 1 for perfect hedge', () => {
      const score = optimizer.calculateStabilityScore(new Decimal(1), new Decimal(0));
      expect(score.toNumber()).toBe(1);
    });
  });

  describe('rebalanceBasket', () => {
    it('should rebalance existing basket', () => {
      const markets = [
        makeMarketData(makeMarket('m1', 'food', 'us-west')),
        makeMarketData(makeMarket('m2', 'housing', 'us-west')),
      ];

      const initial = optimizer.optimizeBasket(profile, markets, {
        maxPositionsPerCategory: 3,
        minPositionSize: new Decimal(10),
        maxPositionSize: new Decimal(1000),
        maxConcentration: 0.3,
        targetVolatilityReduction: 0.5,
        rebalanceCostThreshold: new Decimal(5),
      });

      // Simulate a basket from initial result
      const basket = {
        userId: 'test',
        profileId: 'test',
        positions: initial.positions,
        totalValue: initial.totalCost,
        totalCost: initial.totalCost,
        stabilityScore: initial.stabilityScore,
        hedgingEffectiveness: new Decimal(0.5),
        lastRebalance: new Date(),
        nextRebalanceCheck: new Date(),
        rebalanceCount: 0,
      };

      const result = optimizer.rebalanceBasket(basket, profile, markets, {
        maxPositionsPerCategory: 3,
        minPositionSize: new Decimal(10),
        maxPositionSize: new Decimal(1000),
        maxConcentration: 0.3,
        targetVolatilityReduction: 0.5,
        rebalanceCostThreshold: new Decimal(5),
      });

      expect(result.positions.length).toBeGreaterThan(0);
    });
  });
});
