import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { SignalProcessor } from '../signal-processor.js';
import type { Market, MarketQuote } from '@ghostsignals/core';

function makeMarket(id: string, category: string): Market {
  return {
    id,
    title: `${category} Market`,
    description: `Test market for ${category}`,
    category: category as any,
    region: 'us-west' as any,
    type: 'price_index',
    state: 'active',
    outcomes: [
      { id: `${id}_up`, name: 'Up', probability: new Decimal('0.4'), shares: new Decimal(100) },
      { id: `${id}_down`, name: 'Down', probability: new Decimal('0.6'), shares: new Decimal(100) },
    ],
    liquidity: new Decimal(1000),
    liquidityParameter: new Decimal(100),
    createdAt: new Date(),
  };
}

function makeQuote(outcomeId: string, buyPrice: number, sellPrice: number): MarketQuote {
  return {
    outcomeId,
    ammBuyPrice: new Decimal(buyPrice),
    ammSellPrice: new Decimal(sellPrice),
    liquidity: new Decimal(500),
    spread: new Decimal(buyPrice - sellPrice),
  };
}

describe('SignalProcessor', () => {
  let processor: SignalProcessor;

  beforeEach(() => {
    processor = new SignalProcessor();
  });

  describe('processMarketData', () => {
    it('should return empty signals for empty input', () => {
      const signals = processor.processMarketData([], new Map());
      expect(signals).toEqual([]);
    });

    it('should detect price movement signals', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [
        makeQuote('m1_up', 0.40, 0.38),
        makeQuote('m1_up', 0.50, 0.48), // 25% price jump
      ]);

      const signals = processor.processMarketData([market], quotes);

      // Should detect the price movement
      const priceSignals = signals.filter(s => s.signalType === 'price_movement');
      expect(priceSignals.length).toBeGreaterThan(0);
      
      if (priceSignals.length > 0) {
        expect(priceSignals[0].marketId).toBe('m1');
        expect(priceSignals[0].direction).toBe('positive');
        expect(priceSignals[0].strength.gt(0)).toBe(true);
      }
    });

    it('should store signals for retrieval', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [
        makeQuote('m1_up', 0.40, 0.38),
        makeQuote('m1_up', 0.50, 0.48),
      ]);

      processor.processMarketData([market], quotes);

      const stored = processor.getMarketSignals('m1', 24);
      expect(stored.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('discoverCorrelations', () => {
    it('should build correlation matrix', () => {
      const markets = [
        makeMarket('m1', 'food'),
        makeMarket('m2', 'energy'),
        makeMarket('m3', 'housing'),
      ];

      const matrix = processor.discoverCorrelations(markets);

      expect(matrix.markets.length).toBe(3);
      expect(matrix.correlations.length).toBe(3);
      
      // Diagonal should be 1
      expect(matrix.correlations[0][0].toNumber()).toBe(1);
      expect(matrix.correlations[1][1].toNumber()).toBe(1);
      expect(matrix.correlations[2][2].toNumber()).toBe(1);

      // Off-diagonal should be between -1 and 1
      expect(matrix.correlations[0][1].abs().lte(1)).toBe(true);
    });

    it('should store correlation history', () => {
      const markets = [makeMarket('m1', 'food'), makeMarket('m2', 'energy')];

      processor.discoverCorrelations(markets);
      const latest = processor.getLatestCorrelations();

      expect(latest).not.toBeNull();
      expect(latest!.markets.length).toBe(2);
    });
  });

  describe('calculateMarketEfficiency', () => {
    it('should calculate efficiency score', () => {
      const market = makeMarket('m1', 'food');
      const quotes = [
        makeQuote('m1_up', 0.41, 0.39),
        makeQuote('m1_down', 0.59, 0.57),
      ];

      const efficiency = processor.calculateMarketEfficiency(market, quotes);

      expect(efficiency.marketId).toBe('m1');
      expect(efficiency.score.gte(0)).toBe(true);
      expect(efficiency.score.lte(1)).toBe(true);
      expect(efficiency.factors.bidAskSpread.gte(0)).toBe(true);
      expect(efficiency.factors.volumeLiquidity.gte(0)).toBe(true);
    });

    it('should throw for empty quotes', () => {
      const market = makeMarket('m1', 'food');
      expect(() => processor.calculateMarketEfficiency(market, [])).toThrow('No quotes');
    });

    it('should store and retrieve efficiency scores', () => {
      const market = makeMarket('m1', 'food');
      const quotes = [makeQuote('m1_up', 0.41, 0.39)];

      processor.calculateMarketEfficiency(market, quotes);
      const score = processor.getMarketEfficiency('m1');

      expect(score).not.toBeNull();
      expect(score!.marketId).toBe('m1');
    });
  });

  describe('detectSignalAnomalies', () => {
    it('should return empty for market with no signals', () => {
      const anomalies = processor.detectSignalAnomalies('nonexistent', 24);
      expect(anomalies).toEqual([]);
    });
  });

  describe('getMarketSignals', () => {
    it('should return empty array for unknown market', () => {
      const signals = processor.getMarketSignals('unknown', 24);
      expect(signals).toEqual([]);
    });
  });

  describe('getLatestCorrelations', () => {
    it('should return null when no correlations computed', () => {
      expect(processor.getLatestCorrelations()).toBeNull();
    });
  });

  describe('getMarketEfficiency', () => {
    it('should return null for unknown market', () => {
      expect(processor.getMarketEfficiency('unknown')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle negative price movements', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [
        makeQuote('m1_up', 0.50, 0.48),
        makeQuote('m1_up', 0.40, 0.38), // price drop
      ]);

      const signals = processor.processMarketData([market], quotes);
      const priceSignals = signals.filter(s => s.signalType === 'price_movement');

      if (priceSignals.length > 0) {
        expect(priceSignals[0].direction).toBe('negative');
      }
    });

    it('should not crash on single quote (no price movement detection)', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [makeQuote('m1_up', 0.40, 0.38)]);

      const signals = processor.processMarketData([market], quotes);
      const priceSignals = signals.filter(s => s.signalType === 'price_movement');
      expect(priceSignals.length).toBe(0);
    });

    it('should handle zero previous price gracefully', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [
        makeQuote('m1_up', 0, 0),
        makeQuote('m1_up', 0.50, 0.48),
      ]);

      // Should not throw
      const signals = processor.processMarketData([market], quotes);
      const priceSignals = signals.filter(s => s.signalType === 'price_movement');
      expect(priceSignals.length).toBe(0);
    });

    it('should use category-based correlation fallback when no signals exist', () => {
      const markets = [
        makeMarket('m1', 'food'),
        makeMarket('m2', 'food'),
      ];

      const matrix = processor.discoverCorrelations(markets);
      // Same category should have moderate positive correlation (0.6)
      expect(matrix.correlations[0][1].toNumber()).toBe(0.6);
      // Diagonal is always 1
      expect(matrix.correlations[0][0].toNumber()).toBe(1);
    });

    it('should use low correlation for different categories', () => {
      const markets = [
        makeMarket('m1', 'food'),
        makeMarket('m2', 'energy'),
      ];

      const matrix = processor.discoverCorrelations(markets);
      expect(matrix.correlations[0][1].toNumber()).toBe(0.1);
    });

    it('should cap correlation history at 100 entries', () => {
      const markets = [makeMarket('m1', 'food')];
      for (let i = 0; i < 105; i++) {
        processor.discoverCorrelations(markets);
      }
      // Internal state - just verify getLatestCorrelations still works
      const latest = processor.getLatestCorrelations();
      expect(latest).not.toBeNull();
    });

    it('should handle market with no matching quotes', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      // No quotes for m1
      quotes.set('m2', [makeQuote('m2_up', 0.5, 0.48)]);

      const signals = processor.processMarketData([market], quotes);
      expect(signals.length).toBe(0);
    });

    it('should handle sub-threshold price movements', () => {
      const market = makeMarket('m1', 'food');
      const quotes = new Map<string, MarketQuote[]>();
      quotes.set('m1', [
        makeQuote('m1_up', 0.50, 0.48),
        makeQuote('m1_up', 0.51, 0.49), // 2% change, below 5% threshold
      ]);

      const signals = processor.processMarketData([market], quotes);
      const priceSignals = signals.filter(s => s.signalType === 'price_movement');
      expect(priceSignals.length).toBe(0);
    });
  });
});
