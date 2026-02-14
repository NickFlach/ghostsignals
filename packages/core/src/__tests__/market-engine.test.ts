import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { MarketEngine } from '../market-engine.js';
import { CreateMarketParams } from '../schemas.js';

describe('MarketEngine', () => {
  let engine: MarketEngine;

  beforeEach(() => {
    engine = new MarketEngine();
  });

  const createBinaryMarketParams = (): CreateMarketParams => ({
    title: 'Will Bitcoin reach $100k by end of 2026?',
    description: 'A test prediction market for Bitcoin price',
    category: 'tech',
    region: 'global',
    type: 'binary',
    outcomes: [
      { name: 'Yes', description: 'Bitcoin reaches $100k' },
      { name: 'No', description: 'Bitcoin does not reach $100k' }
    ],
    initialLiquidity: new Decimal(1000),
    liquidityParameter: new Decimal(100),
    resolutionDate: new Date('2026-12-31')
  });

  describe('Market Creation', () => {
    it('should create a binary market correctly', () => {
      const params = createBinaryMarketParams();
      const market = engine.createMarket(params);
      
      expect(market.id).toBeDefined();
      expect(market.title).toBe(params.title);
      expect(market.outcomes.length).toBe(2);
      expect(market.state).toBe('active');
      expect(market.liquidity.toString()).toBe('1000');
      
      // Initial probabilities should be 0.5 each
      expect(market.outcomes[0].probability.toString()).toBe('0.5');
      expect(market.outcomes[1].probability.toString()).toBe('0.5');
    });

    it('should create multi-outcome market correctly', () => {
      const params: CreateMarketParams = {
        ...createBinaryMarketParams(),
        outcomes: [
          { name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }
        ]
      };
      
      const market = engine.createMarket(params);
      
      expect(market.outcomes.length).toBe(4);
      // Each outcome should have 0.25 probability
      market.outcomes.forEach(outcome => {
        expect(outcome.probability.toString()).toBe('0.25');
      });
    });

    it('should retrieve created market', () => {
      const params = createBinaryMarketParams();
      const market = engine.createMarket(params);
      
      const retrieved = engine.getMarket(market.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(market.id);
    });

    it('should list active markets', () => {
      const market1 = engine.createMarket(createBinaryMarketParams());
      const market2 = engine.createMarket({
        ...createBinaryMarketParams(),
        title: 'Another market'
      });
      
      const activeMarkets = engine.getActiveMarkets();
      expect(activeMarkets.length).toBe(2);
      expect(activeMarkets.map(m => m.id)).toContain(market1.id);
      expect(activeMarkets.map(m => m.id)).toContain(market2.id);
    });
  });

  describe('Price Quotes', () => {
    it('should provide AMM quotes', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      const quote = engine.getQuote(market.id, outcomeId, new Decimal(10), 'buy');
      
      expect(quote).toBeDefined();
      expect(quote!.ammBuyPrice.gt(0)).toBe(true);
      expect(quote!.ammSellPrice.gt(0)).toBe(true);
      expect(quote!.liquidity.toString()).toBe('100');
      expect(quote!.spread.gt(0)).toBe(true);
    });

    it('should return null for invalid market', () => {
      const quote = engine.getQuote('invalid_market', 'invalid_outcome', new Decimal(10), 'buy');
      expect(quote).toBeNull();
    });
  });

  describe('AMM Trading', () => {
    it('should execute buy trade against AMM', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      const tradeRequest = {
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'buy' as const,
        quantity: new Decimal(50),
        useAMM: true
      };
      
      const result = engine.executeTrade(tradeRequest);
      
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].quantity.toString()).toBe('50');
      expect(result.trades[0].buyerId).toBe('trader1');
      expect(result.trades[0].sellerId).toBe('AMM');
      expect(result.updatedMarket).toBeDefined();
      
      // Probability should have increased for the purchased outcome
      const updatedOutcome = result.updatedMarket!.outcomes.find(o => o.id === outcomeId);
      expect(updatedOutcome!.probability.gt(new Decimal(0.5))).toBe(true);
    });

    it('should execute sell trade against AMM', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      // First buy some shares
      engine.executeTrade({
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'buy',
        quantity: new Decimal(100),
        useAMM: true
      });
      
      // Then sell some
      const sellRequest = {
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'sell' as const,
        quantity: new Decimal(30),
        useAMM: true
      };
      
      const result = engine.executeTrade(sellRequest);
      
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].quantity.toString()).toBe('30');
      expect(result.trades[0].sellerId).toBe('trader1');
      expect(result.trades[0].buyerId).toBe('AMM');
    });
  });

  describe('Limit Orders', () => {
    it('should place limit order when not using AMM', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      const tradeRequest = {
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'buy' as const,
        quantity: new Decimal(50),
        price: new Decimal(0.6),
        useAMM: false
      };
      
      const result = engine.executeTrade(tradeRequest);
      
      expect(result.order).toBeDefined();
      expect(result.order!.price.toString()).toBe('0.6');
      expect(result.order!.quantity.toString()).toBe('50');
      expect(result.order!.status).toBe('pending');
      expect(result.trades.length).toBe(0); // No immediate match
    });

    it('should match limit orders', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      // Place sell limit order
      engine.executeTrade({
        userId: 'seller',
        marketId: market.id,
        outcomeId,
        type: 'sell',
        quantity: new Decimal(100),
        price: new Decimal(0.5)
      });
      
      // Place matching buy limit order
      const result = engine.executeTrade({
        userId: 'buyer',
        marketId: market.id,
        outcomeId,
        type: 'buy',
        quantity: new Decimal(50),
        price: new Decimal(0.5)
      });
      
      expect(result.trades.length).toBe(1);
      expect(result.trades[0].buyerId).toBe('buyer');
      expect(result.trades[0].sellerId).toBe('seller');
      expect(result.trades[0].quantity.toString()).toBe('50');
      expect(result.trades[0].price.toString()).toBe('0.5');
    });
  });

  describe('Position Tracking', () => {
    it('should track user positions', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      // Execute some trades
      engine.executeTrade({
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'buy',
        quantity: new Decimal(100),
        useAMM: true
      });
      
      const positions = engine.getUserPositions('trader1');
      expect(positions.length).toBe(1);
      expect(positions[0].shares.toString()).toBe('100');
      expect(positions[0].userId).toBe('trader1');
      expect(positions[0].marketId).toBe(market.id);
    });

    it('should calculate PnL', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const outcomeId = market.outcomes[0].id;
      
      // Execute buy trade
      engine.executeTrade({
        userId: 'trader1',
        marketId: market.id,
        outcomeId,
        type: 'buy',
        quantity: new Decimal(50),
        useAMM: true
      });
      
      const pnl = engine.calculateUserPnL('trader1');
      expect(pnl.unrealized).toBeDefined();
      expect(pnl.realized).toBeDefined();
    });
  });

  describe('Market Resolution', () => {
    it('should resolve market and calculate payouts', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      const winningOutcome = market.outcomes[0];
      const losingOutcome = market.outcomes[1];
      
      // Users buy different outcomes
      engine.executeTrade({
        userId: 'winner',
        marketId: market.id,
        outcomeId: winningOutcome.id,
        type: 'buy',
        quantity: new Decimal(100),
        useAMM: true
      });
      
      engine.executeTrade({
        userId: 'loser',
        marketId: market.id,
        outcomeId: losingOutcome.id,
        type: 'buy',
        quantity: new Decimal(50),
        useAMM: true
      });
      
      // Resolve market
      const payouts = engine.resolveMarket(market.id, winningOutcome.id);
      
      expect(payouts.get('winner')?.toString()).toBe('100');
      expect(payouts.get('loser')?.toString()).toBe('0');
      
      // Check market state
      const resolvedMarket = engine.getMarket(market.id);
      expect(resolvedMarket!.state).toBe('resolved');
      expect(resolvedMarket!.resolvedOutcome).toBe(winningOutcome.id);
    });
  });

  describe('Market State Management', () => {
    it('should pause and resume markets', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      
      const paused = engine.pauseMarket(market.id);
      expect(paused).toBe(true);
      
      const pausedMarket = engine.getMarket(market.id);
      expect(pausedMarket!.state).toBe('paused');
      
      const resumed = engine.resumeMarket(market.id);
      expect(resumed).toBe(true);
      
      const resumedMarket = engine.getMarket(market.id);
      expect(resumedMarket!.state).toBe('active');
    });

    it('should prevent trading on paused markets', () => {
      const market = engine.createMarket(createBinaryMarketParams());
      engine.pauseMarket(market.id);
      
      expect(() => {
        engine.executeTrade({
          userId: 'trader1',
          marketId: market.id,
          outcomeId: market.outcomes[0].id,
          type: 'buy',
          quantity: new Decimal(50),
          useAMM: true
        });
      }).toThrow('Market not found or not active');
    });
  });
});