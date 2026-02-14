import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { HedgeEngine, type HedgeEngineConfig } from '../hedge-engine.js';
import { MarketEngine } from '@ghostsignals/core';
import type { ImportedTransaction } from '../expense-profiler.js';

describe('HedgeEngine', () => {
  let engine: HedgeEngine;
  let marketEngine: MarketEngine;

  const config: HedgeEngineConfig = {
    defaultRiskTolerance: 0.5,
    defaultRebalanceThreshold: 0.05,
    maxPositionsPerBasket: 20,
    minHedgingBudget: new Decimal(100),
    rebalanceCheckFrequencyHours: 24,
  };

  const sampleTransactions: ImportedTransaction[] = [
    { date: new Date('2026-01-01'), amount: new Decimal(600), description: 'Grocery store', category: 'groceries', isIncome: false },
    { date: new Date('2026-01-05'), amount: new Decimal(45), description: 'Restaurant', category: 'dining_out', isIncome: false },
    { date: new Date('2026-01-01'), amount: new Decimal(1800), description: 'Rent payment', category: 'rent', isIncome: false },
    { date: new Date('2026-01-15'), amount: new Decimal(120), description: 'Electric bill', category: 'electricity', isIncome: false },
    { date: new Date('2026-01-10'), amount: new Decimal(200), description: 'Gas station', category: 'fuel', isIncome: false },
    { date: new Date('2026-02-01'), amount: new Decimal(580), description: 'Grocery store', category: 'groceries', isIncome: false },
    { date: new Date('2026-02-01'), amount: new Decimal(1800), description: 'Rent payment', category: 'rent', isIncome: false },
  ];

  beforeEach(() => {
    marketEngine = new MarketEngine();
    engine = new HedgeEngine(marketEngine, config);

    // Create some markets for the engine to use
    marketEngine.createMarket({
      title: 'Food Price Index (US West)',
      description: 'Food prices in western US',
      category: 'food',
      region: 'us-west',
      type: 'price_index',
      outcomes: [
        { name: 'Up >5%', description: 'Price increases more than 5%' },
        { name: 'Stable', description: 'Price stays within ±5%' },
        { name: 'Down >5%', description: 'Price decreases more than 5%' },
      ],
      initialLiquidity: new Decimal(1000),
      liquidityParameter: new Decimal(100),
    });

    marketEngine.createMarket({
      title: 'Housing Cost Index',
      description: 'Housing costs nationwide',
      category: 'housing',
      region: 'us-west',
      type: 'price_index',
      outcomes: [
        { name: 'Up >5%' },
        { name: 'Stable' },
        { name: 'Down >5%' },
      ],
      initialLiquidity: new Decimal(1000),
      liquidityParameter: new Decimal(100),
    });
  });

  describe('createExpenseProfile', () => {
    it('should create a profile from transactions', () => {
      const profile = engine.createExpenseProfile(
        'user1',
        sampleTransactions,
        0.5,
        new Decimal(200),
        'Test Profile'
      );

      expect(profile.userId).toBe('user1');
      expect(profile.name).toBe('Test Profile');
      expect(profile.expenses.length).toBeGreaterThan(0);
      expect(profile.totalMonthlyExpenses.gt(0)).toBe(true);
      expect(profile.riskTolerance).toBe(0.5);
      expect(profile.hedgingBudget.eq(200)).toBe(true);
    });

    it('should filter out income transactions', () => {
      const withIncome = [
        ...sampleTransactions,
        { date: new Date('2026-01-15'), amount: new Decimal(5000), description: 'Salary', category: undefined, isIncome: true },
      ];

      const profile = engine.createExpenseProfile('user1', withIncome as any);
      // Income should not appear in expenses
      const totalFromProfile = profile.totalMonthlyExpenses;
      expect(totalFromProfile.gt(0)).toBe(true);
      expect(totalFromProfile.lt(5000)).toBe(true);
    });
  });

  describe('getExpenseProfile / getHedgingBasket', () => {
    it('should return null for unknown user', () => {
      expect(engine.getExpenseProfile('nonexistent')).toBeNull();
      expect(engine.getHedgingBasket('nonexistent')).toBeNull();
    });

    it('should return profile after creation', () => {
      engine.createExpenseProfile('user1', sampleTransactions);
      const profile = engine.getExpenseProfile('user1');
      expect(profile).not.toBeNull();
      expect(profile!.userId).toBe('user1');
    });
  });

  describe('checkRebalanceNeeded', () => {
    it('should return no rebalance for unknown user', () => {
      const rec = engine.checkRebalanceNeeded('nonexistent');
      expect(rec.recommendRebalance).toBe(false);
    });
  });

  describe('getBasketPerformance', () => {
    it('should return null for user without basket', () => {
      const perf = engine.getBasketPerformance('nonexistent');
      expect(perf).toBeNull();
    });
  });

  describe('updateExpenseProfile', () => {
    it('should update an existing profile with new transactions', () => {
      engine.createExpenseProfile('user1', sampleTransactions);

      const newTransactions: ImportedTransaction[] = [
        { date: new Date('2026-03-01'), amount: new Decimal(650), description: 'Grocery store', category: 'groceries', isIncome: false },
      ];

      const updated = engine.updateExpenseProfile('user1', newTransactions);
      expect(updated.userId).toBe('user1');
    });

    it('should throw for unknown user', () => {
      expect(() => engine.updateExpenseProfile('nope', [])).toThrow('Profile not found');
    });
  });

  describe('predictFutureExpenses', () => {
    it('should predict expenses for a profile', () => {
      engine.createExpenseProfile('user1', sampleTransactions);
      const prediction = engine.predictFutureExpenses('user1', 3);

      expect(prediction.expectedAmount.gt(0)).toBe(true);
      expect(prediction.upperBound.gte(prediction.expectedAmount)).toBe(true);
      expect(prediction.lowerBound.lte(prediction.expectedAmount)).toBe(true);
    });

    it('should throw for unknown user', () => {
      expect(() => engine.predictFutureExpenses('nope', 3)).toThrow('Profile not found');
    });
  });
});
