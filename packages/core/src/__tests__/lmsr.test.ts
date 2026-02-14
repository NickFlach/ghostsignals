import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { LMSREngine } from '../lmsr.js';
import { Outcome } from '../schemas.js';

describe('LMSREngine', () => {
  const createTestOutcomes = (numOutcomes: number = 2, initialShares: number = 100): Outcome[] => {
    return Array.from({ length: numOutcomes }, (_, i) => ({
      id: `outcome_${i}`,
      name: `Outcome ${i}`,
      description: `Test outcome ${i}`,
      probability: new Decimal(1).div(numOutcomes),
      shares: new Decimal(initialShares)
    }));
  };

  describe('Price Calculations', () => {
    it('should calculate correct initial prices for binary market', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const prices = engine.calculatePrices(outcomes);
      
      // With equal initial shares, both outcomes should have 0.5 probability
      expect(prices[0].toFixed(3)).toBe('0.500');
      expect(prices[1].toFixed(3)).toBe('0.500');
      
      // Probabilities should sum to 1
      const sum = prices.reduce((acc, p) => acc.add(p), new Decimal(0));
      expect(sum.toFixed(6)).toBe('1.000000');
    });

    it('should calculate correct prices for multi-outcome market', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(4, 100);
      
      const prices = engine.calculatePrices(outcomes);
      
      // With equal initial shares, all outcomes should have 0.25 probability
      prices.forEach(price => {
        expect(price.toFixed(3)).toBe('0.250');
      });
      
      // Probabilities should sum to 1
      const sum = prices.reduce((acc, p) => acc.add(p), new Decimal(0));
      expect(sum.toFixed(6)).toBe('1.000000');
    });

    it('should update prices correctly after buying shares', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      // Buy 50 shares of outcome 0
      const { newPrices } = engine.calculateBuyCost(outcomes, 0, new Decimal(50));
      
      // Outcome 0 price should increase, outcome 1 should decrease
      expect(newPrices[0].gt(new Decimal(0.5))).toBe(true);
      expect(newPrices[1].lt(new Decimal(0.5))).toBe(true);
      
      // Prices should still sum to 1
      const sum = newPrices.reduce((acc, p) => acc.add(p), new Decimal(0));
      expect(sum.toFixed(6)).toBe('1.000000');
    });
  });

  describe('Cost Calculations', () => {
    it('should calculate non-zero cost for buying shares', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const { cost } = engine.calculateBuyCost(outcomes, 0, new Decimal(10));
      
      expect(cost.gt(0)).toBe(true);
    });

    it('should calculate higher cost for larger quantities', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const { cost: smallCost } = engine.calculateBuyCost(outcomes, 0, new Decimal(10));
      const { cost: largeCost } = engine.calculateBuyCost(outcomes, 0, new Decimal(20));
      
      expect(largeCost.gt(smallCost)).toBe(true);
    });

    it('should have decreasing marginal cost (convex pricing)', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const { cost: cost10 } = engine.calculateBuyCost(outcomes, 0, new Decimal(10));
      const { cost: cost20 } = engine.calculateBuyCost(outcomes, 0, new Decimal(20));
      
      const marginalCost1 = cost10.div(10);
      const marginalCost2 = cost20.sub(cost10).div(10);
      
      // Second 10 shares should cost more per share (convex function)
      expect(marginalCost2.gt(marginalCost1)).toBe(true);
    });

    it('should calculate positive payout for selling shares', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const { payout } = engine.calculateSellPayout(outcomes, 0, new Decimal(10));
      
      expect(payout.gt(0)).toBe(true);
    });
  });

  describe('Arbitrage Prevention', () => {
    it('should prevent simple arbitrage opportunities', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      // Buy and immediately sell the same quantity
      const { cost: buyCost } = engine.calculateBuyCost(outcomes, 0, new Decimal(10));
      
      // Update outcomes with the purchase
      const updatedOutcomes = [...outcomes];
      updatedOutcomes[0].shares = updatedOutcomes[0].shares.add(new Decimal(10));
      
      const { payout: sellPayout } = engine.calculateSellPayout(updatedOutcomes, 0, new Decimal(10));
      
      // Sell payout should be less than buy cost (spread)
      expect(sellPayout.lt(buyCost)).toBe(true);
    });
  });

  describe('Liquidity Parameter Effects', () => {
    it('should have lower spreads with higher liquidity parameter', () => {
      const lowLiquidity = new LMSREngine(new Decimal(50));
      const highLiquidity = new LMSREngine(new Decimal(200));
      const outcomes = createTestOutcomes(2, 100);
      const quantity = new Decimal(10);
      
      const lowSpread = lowLiquidity.calculateSpread(outcomes, 0, quantity);
      const highSpread = highLiquidity.calculateSpread(outcomes, 0, quantity);
      
      expect(highSpread.spread.lt(lowSpread.spread)).toBe(true);
    });
  });

  describe('Market Resolution', () => {
    it('should calculate correct payouts on resolution', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      // Create user positions
      const userPositions = new Map([
        ['user1', [{ outcomeIndex: 0, shares: new Decimal(50) }]], // 50 shares of winner
        ['user2', [{ outcomeIndex: 1, shares: new Decimal(30) }]], // 30 shares of loser
        ['user3', [
          { outcomeIndex: 0, shares: new Decimal(20) }, // 20 shares of winner
          { outcomeIndex: 1, shares: new Decimal(10) }  // 10 shares of loser
        ]]
      ]);
      
      // Resolve market with outcome 0 as winner
      const payouts = engine.resolveMarket(outcomes, 0, userPositions);
      
      expect(payouts.get('user1')?.toString()).toBe('50'); // 50 winning shares
      expect(payouts.get('user2')?.toString()).toBe('0');  // 0 winning shares
      expect(payouts.get('user3')?.toString()).toBe('20'); // 20 winning shares
    });
  });

  describe('Probability Validation', () => {
    it('should validate that probabilities sum to 1', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(3, 100);
      
      const isValid = engine.validateProbabilities(outcomes);
      expect(isValid).toBe(true);
    });

    it('should detect invalid probability distributions', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      // Manually set invalid probabilities
      outcomes[0].probability = new Decimal(0.6);
      outcomes[1].probability = new Decimal(0.6); // Sum = 1.2
      
      const isValid = engine.validateProbabilities(outcomes, new Decimal(0.001));
      expect(isValid).toBe(false);
    });
  });

  describe('Expected Value Calculations', () => {
    it('should calculate correct expected value for positions', () => {
      const engine = new LMSREngine(new Decimal(100));
      const outcomes = createTestOutcomes(2, 100);
      
      const position = [
        { outcomeIndex: 0, shares: new Decimal(100) },
        { outcomeIndex: 1, shares: new Decimal(50) }
      ];
      
      const expectedValue = engine.calculateExpectedValue(outcomes, position);
      
      // With equal probabilities (0.5 each), EV = 100 * 0.5 + 50 * 0.5 = 75
      expect(expectedValue.toFixed(1)).toBe('75.0');
    });
  });
});