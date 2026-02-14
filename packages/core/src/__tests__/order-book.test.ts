import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { OrderBook } from '../order-book.js';
import { Order } from '../schemas.js';

describe('OrderBook', () => {
  let orderBook: OrderBook;
  const marketId = 'test_market';
  const outcomeId = 'test_outcome';

  beforeEach(() => {
    orderBook = new OrderBook(marketId, outcomeId);
  });

  const createOrder = (
    id: string,
    type: 'buy' | 'sell',
    price: number,
    quantity: number,
    userId: string = 'user1'
  ): Order => ({
    id,
    marketId,
    outcomeId,
    userId,
    type,
    quantity: new Decimal(quantity),
    price: new Decimal(price),
    status: 'pending',
    filledQuantity: new Decimal(0),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  describe('Order Addition', () => {
    it('should add a buy order to the book', () => {
      const order = createOrder('order1', 'buy', 0.6, 100);
      const { trades, remainingOrder } = orderBook.addOrder(order);
      
      expect(trades.length).toBe(0);
      expect(remainingOrder).toBeDefined();
      expect(remainingOrder?.quantity.toString()).toBe('100');
    });

    it('should add a sell order to the book', () => {
      const order = createOrder('order1', 'sell', 0.4, 100);
      const { trades, remainingOrder } = orderBook.addOrder(order);
      
      expect(trades.length).toBe(0);
      expect(remainingOrder).toBeDefined();
      expect(remainingOrder?.quantity.toString()).toBe('100');
    });

    it('should reject orders with wrong market/outcome', () => {
      const order = createOrder('order1', 'buy', 0.6, 100);
      order.marketId = 'wrong_market';
      
      expect(() => orderBook.addOrder(order)).toThrow('Order market/outcome mismatch');
    });
  });

  describe('Order Matching', () => {
    it('should match compatible buy and sell orders', () => {
      // Add a sell order first
      const sellOrder = createOrder('sell1', 'sell', 0.5, 100, 'seller');
      orderBook.addOrder(sellOrder);
      
      // Add a buy order that matches
      const buyOrder = createOrder('buy1', 'buy', 0.5, 50, 'buyer');
      const { trades, remainingOrder } = orderBook.addOrder(buyOrder);
      
      expect(trades.length).toBe(1);
      expect(trades[0].quantity.toString()).toBe('50');
      expect(trades[0].price.toString()).toBe('0.5');
      expect(trades[0].buyerId).toBe('buyer');
      expect(trades[0].sellerId).toBe('seller');
      expect(remainingOrder).toBeUndefined();
    });

    it('should partially fill large orders', () => {
      // Add small sell order
      const sellOrder = createOrder('sell1', 'sell', 0.5, 30, 'seller');
      orderBook.addOrder(sellOrder);
      
      // Add large buy order
      const buyOrder = createOrder('buy1', 'buy', 0.5, 100, 'buyer');
      const { trades, remainingOrder } = orderBook.addOrder(buyOrder);
      
      expect(trades.length).toBe(1);
      expect(trades[0].quantity.toString()).toBe('30');
      expect(remainingOrder).toBeDefined();
      expect(remainingOrder?.quantity.toString()).toBe('70');
    });

    it('should match at the maker price (price improvement)', () => {
      // Seller wants 0.4
      const sellOrder = createOrder('sell1', 'sell', 0.4, 100, 'seller');
      orderBook.addOrder(sellOrder);
      
      // Buyer willing to pay 0.6
      const buyOrder = createOrder('buy1', 'buy', 0.6, 50, 'buyer');
      const { trades } = orderBook.addOrder(buyOrder);
      
      // Trade should execute at seller's price (0.4)
      expect(trades[0].price.toString()).toBe('0.4');
    });

    it('should not match incompatible prices', () => {
      // Seller wants 0.7
      const sellOrder = createOrder('sell1', 'sell', 0.7, 100, 'seller');
      orderBook.addOrder(sellOrder);
      
      // Buyer only willing to pay 0.5
      const buyOrder = createOrder('buy1', 'buy', 0.5, 50, 'buyer');
      const { trades, remainingOrder } = orderBook.addOrder(buyOrder);
      
      expect(trades.length).toBe(0);
      expect(remainingOrder).toBeDefined();
    });

    it('should match multiple orders with price-time priority', () => {
      // Add multiple sell orders
      const sell1 = createOrder('sell1', 'sell', 0.4, 30, 'seller1');
      const sell2 = createOrder('sell2', 'sell', 0.4, 40, 'seller2');
      const sell3 = createOrder('sell3', 'sell', 0.3, 20, 'seller3');
      
      orderBook.addOrder(sell1);
      orderBook.addOrder(sell2);
      orderBook.addOrder(sell3);
      
      // Large buy order should match best prices first
      const buyOrder = createOrder('buy1', 'buy', 0.5, 80, 'buyer');
      const { trades } = orderBook.addOrder(buyOrder);
      
      expect(trades.length).toBe(3);
      // Should match lowest price first (0.3), then by time for same price
      expect(trades[0].price.toString()).toBe('0.3');
      expect(trades[1].price.toString()).toBe('0.4');
      expect(trades[2].price.toString()).toBe('0.4');
      expect(trades[0].sellerId).toBe('seller3');
      expect(trades[1].sellerId).toBe('seller1'); // Earlier timestamp
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel pending orders', () => {
      const order = createOrder('order1', 'buy', 0.6, 100);
      const { remainingOrder } = orderBook.addOrder(order);
      
      const cancelled = orderBook.cancelOrder(remainingOrder!.id);
      expect(cancelled).toBe(true);
      
      // Order should be removed from book
      const levels = orderBook.getOrderBookLevels();
      expect(levels.bids.length).toBe(0);
    });

    it('should not cancel non-existent orders', () => {
      const cancelled = orderBook.cancelOrder('non_existent');
      expect(cancelled).toBe(false);
    });

    it('should not cancel already filled orders', () => {
      // Add matching orders to create a fill
      const sellOrder = createOrder('sell1', 'sell', 0.5, 100, 'seller');
      orderBook.addOrder(sellOrder);
      
      const buyOrder = createOrder('buy1', 'buy', 0.5, 100, 'buyer');
      orderBook.addOrder(buyOrder);
      
      // Try to cancel the now-filled sell order
      const cancelled = orderBook.cancelOrder('sell1');
      expect(cancelled).toBe(false);
    });
  });

  describe('Order Book Levels', () => {
    it('should aggregate orders by price level', () => {
      // Add multiple orders at same price
      const buy1 = createOrder('buy1', 'buy', 0.6, 100, 'user1');
      const buy2 = createOrder('buy2', 'buy', 0.6, 50, 'user2');
      const buy3 = createOrder('buy3', 'buy', 0.5, 75, 'user3');
      
      orderBook.addOrder(buy1);
      orderBook.addOrder(buy2);
      orderBook.addOrder(buy3);
      
      const { bids } = orderBook.getOrderBookLevels();
      expect(bids.length).toBe(2);
      
      // Should be sorted by price descending
      expect(bids[0].price.toString()).toBe('0.6');
      expect(bids[0].quantity.toString()).toBe('150'); // 100 + 50
      expect(bids[0].orderCount).toBe(2);
      
      expect(bids[1].price.toString()).toBe('0.5');
      expect(bids[1].quantity.toString()).toBe('75');
      expect(bids[1].orderCount).toBe(1);
    });

    it('should sort bids and asks correctly', () => {
      const buy1 = createOrder('buy1', 'buy', 0.4, 100);
      const buy2 = createOrder('buy2', 'buy', 0.6, 50);
      const sell1 = createOrder('sell1', 'sell', 0.7, 30);
      const sell2 = createOrder('sell2', 'sell', 0.5, 40);
      
      orderBook.addOrder(buy1);
      orderBook.addOrder(buy2);
      orderBook.addOrder(sell1);
      orderBook.addOrder(sell2);
      
      const { bids, asks } = orderBook.getOrderBookLevels();
      
      // Bids sorted high to low
      expect(bids[0].price.toString()).toBe('0.6');
      expect(bids[1].price.toString()).toBe('0.4');
      
      // Asks sorted low to high
      expect(asks[0].price.toString()).toBe('0.5');
      expect(asks[1].price.toString()).toBe('0.7');
    });
  });

  describe('Best Prices and Spread', () => {
    it('should return best bid and ask', () => {
      const buy = createOrder('buy1', 'buy', 0.55, 100);
      const sell = createOrder('sell1', 'sell', 0.65, 100);
      
      orderBook.addOrder(buy);
      orderBook.addOrder(sell);
      
      const { bestBid, bestAsk } = orderBook.getBestPrices();
      expect(bestBid?.toString()).toBe('0.55');
      expect(bestAsk?.toString()).toBe('0.65');
    });

    it('should calculate spread correctly', () => {
      const buy = createOrder('buy1', 'buy', 0.45, 100);
      const sell = createOrder('sell1', 'sell', 0.55, 100);
      
      orderBook.addOrder(buy);
      orderBook.addOrder(sell);
      
      const spread = orderBook.getSpread();
      expect(spread?.toString()).toBe('0.1');
    });

    it('should handle empty book', () => {
      const { bestBid, bestAsk } = orderBook.getBestPrices();
      expect(bestBid).toBeUndefined();
      expect(bestAsk).toBeUndefined();
      
      const spread = orderBook.getSpread();
      expect(spread).toBeNull();
    });
  });

  describe('User Orders', () => {
    it('should return orders for specific user', () => {
      const user1Order1 = createOrder('order1', 'buy', 0.6, 100, 'user1');
      const user1Order2 = createOrder('order2', 'sell', 0.4, 50, 'user1');
      const user2Order = createOrder('order3', 'buy', 0.5, 75, 'user2');
      
      orderBook.addOrder(user1Order1);
      orderBook.addOrder(user1Order2);
      orderBook.addOrder(user2Order);
      
      const user1Orders = orderBook.getUserOrders('user1');
      expect(user1Orders.length).toBe(2);
      expect(user1Orders.every(order => order.userId === 'user1')).toBe(true);
      
      const user2Orders = orderBook.getUserOrders('user2');
      expect(user2Orders.length).toBe(1);
      expect(user2Orders[0].userId).toBe('user2');
    });
  });

  describe('VWAP Calculation', () => {
    it('should calculate volume-weighted average price', () => {
      // Create some trades first
      const sell1 = createOrder('sell1', 'sell', 0.5, 100, 'seller1');
      const sell2 = createOrder('sell2', 'sell', 0.6, 50, 'seller2');
      orderBook.addOrder(sell1);
      orderBook.addOrder(sell2);
      
      const buy = createOrder('buy1', 'buy', 0.7, 150, 'buyer');
      orderBook.addOrder(buy);
      
      // VWAP should be weighted average: (100 * 0.5 + 50 * 0.6) / 150 = 0.533...
      const vwap = orderBook.calculateVWAP(60000); // 1 minute
      expect(vwap?.toFixed(3)).toBe('0.533');
    });

    it('should return null for empty trade history', () => {
      const vwap = orderBook.calculateVWAP(60000);
      expect(vwap).toBeNull();
    });
  });
});