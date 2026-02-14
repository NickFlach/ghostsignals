import Decimal from 'decimal.js';
import { Order, OrderType, OrderStatus, Trade } from './schemas.js';

/**
 * Order Book implementation for limit orders alongside AMM
 * 
 * The order book allows users to place limit orders that can be matched
 * with other users directly, providing better execution than AMM for
 * large orders or when users want to trade at specific prices.
 */

export interface OrderBookLevel {
  price: Decimal;
  quantity: Decimal;
  orderCount: number;
}

export class OrderBook {
  private orders: Map<string, Order> = new Map();
  private buyOrders: Map<string, Order[]> = new Map(); // price -> orders
  private sellOrders: Map<string, Order[]> = new Map(); // price -> orders
  private trades: Trade[] = [];

  constructor(private marketId: string, private outcomeId: string) {}

  /**
   * Add a new order to the book
   */
  addOrder(order: Order): { trades: Trade[]; remainingOrder?: Order } {
    if (order.marketId !== this.marketId || order.outcomeId !== this.outcomeId) {
      throw new Error('Order market/outcome mismatch');
    }

    this.orders.set(order.id, order);

    // Try to match the order immediately
    const matchResult = this.matchOrder(order);
    
    // If there's a remaining quantity, add to the appropriate book
    if (matchResult.remainingOrder && matchResult.remainingOrder.quantity.gt(0)) {
      this.addToBook(matchResult.remainingOrder);
    }

    // Store executed trades
    this.trades.push(...matchResult.trades);

    return matchResult;
  }

  /**
   * Cancel an existing order
   */
  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') {
      return false;
    }

    // Remove from book
    this.removeFromBook(order);
    
    // Update status
    order.status = 'cancelled';
    order.updatedAt = new Date();

    return true;
  }

  /**
   * Get current order book levels (aggregated by price)
   */
  getOrderBookLevels(): { 
    bids: OrderBookLevel[]; 
    asks: OrderBookLevel[] 
  } {
    const bids = this.aggregateOrders(this.buyOrders);
    const asks = this.aggregateOrders(this.sellOrders);

    // Sort bids descending (highest price first)
    bids.sort((a, b) => b.price.sub(a.price).toNumber());
    
    // Sort asks ascending (lowest price first)
    asks.sort((a, b) => a.price.sub(b.price).toNumber());

    return { bids, asks };
  }

  /**
   * Get best bid and ask prices
   */
  getBestPrices(): { bestBid?: Decimal; bestAsk?: Decimal } {
    const levels = this.getOrderBookLevels();
    
    const bestBid = levels.bids.length > 0 ? levels.bids[0].price : undefined;
    const bestAsk = levels.asks.length > 0 ? levels.asks[0].price : undefined;

    return { bestBid, bestAsk };
  }

  /**
   * Calculate the spread between best bid and ask
   */
  getSpread(): Decimal | null {
    const { bestBid, bestAsk } = this.getBestPrices();
    
    if (!bestBid || !bestAsk) {
      return null;
    }

    return bestAsk.sub(bestBid);
  }

  /**
   * Get all orders for a specific user
   */
  getUserOrders(userId: string): Order[] {
    return Array.from(this.orders.values()).filter(order => order.userId === userId);
  }

  /**
   * Get recent trades
   */
  getRecentTrades(limit: number = 50): Trade[] {
    return this.trades
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Calculate volume-weighted average price (VWAP) over recent trades
   */
  calculateVWAP(timeWindowMs: number): Decimal | null {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeWindowMs);

    const recentTrades = this.trades.filter(trade => trade.timestamp >= cutoff);
    
    if (recentTrades.length === 0) {
      return null;
    }

    let totalVolume = new Decimal(0);
    let totalValue = new Decimal(0);

    for (const trade of recentTrades) {
      const volume = trade.quantity;
      const value = trade.price.mul(volume);
      
      totalVolume = totalVolume.add(volume);
      totalValue = totalValue.add(value);
    }

    return totalValue.div(totalVolume);
  }

  private matchOrder(order: Order): { trades: Trade[]; remainingOrder?: Order } {
    const trades: Trade[] = [];
    let remainingQuantity = order.quantity;
    
    // Get opposing orders
    const opposingOrders = order.type === 'buy' 
      ? this.getMatchingAskOrders(order.price)
      : this.getMatchingBidOrders(order.price);

    for (const opposingOrder of opposingOrders) {
      if (remainingQuantity.lte(0)) break;

      const matchedQuantity = Decimal.min(remainingQuantity, opposingOrder.quantity);
      const tradePrice = opposingOrder.price; // Price improvement goes to taker

      // Create trade
      const trade: Trade = {
        id: `${order.id}_${opposingOrder.id}_${Date.now()}`,
        marketId: this.marketId,
        outcomeId: this.outcomeId,
        buyerId: order.type === 'buy' ? order.userId : opposingOrder.userId,
        sellerId: order.type === 'sell' ? order.userId : opposingOrder.userId,
        quantity: matchedQuantity,
        price: tradePrice,
        timestamp: new Date()
      };

      trades.push(trade);

      // Update orders
      remainingQuantity = remainingQuantity.sub(matchedQuantity);
      opposingOrder.quantity = opposingOrder.quantity.sub(matchedQuantity);
      opposingOrder.filledQuantity = opposingOrder.filledQuantity.add(matchedQuantity);

      // Update order status
      if (opposingOrder.quantity.lte(0)) {
        opposingOrder.status = 'filled';
        this.removeFromBook(opposingOrder);
      } else {
        opposingOrder.status = 'partial';
      }
      opposingOrder.updatedAt = new Date();
    }

    // Create remaining order if needed
    let remainingOrder: Order | undefined;
    if (remainingQuantity.gt(0)) {
      remainingOrder = {
        ...order,
        quantity: remainingQuantity,
        filledQuantity: order.quantity.sub(remainingQuantity),
        status: order.filledQuantity.gt(0) ? 'partial' : 'pending'
      };
    } else {
      // Order fully filled
      order.status = 'filled';
      order.filledQuantity = order.quantity;
      order.updatedAt = new Date();
    }

    return { trades, remainingOrder };
  }

  private getMatchingAskOrders(maxPrice: Decimal): Order[] {
    const matchingOrders: Order[] = [];
    
    for (const [priceKey, orders] of this.sellOrders) {
      const price = new Decimal(priceKey);
      if (price.lte(maxPrice)) {
        matchingOrders.push(...orders);
      }
    }

    // Sort by price (lowest first), then by time (oldest first)
    return matchingOrders.sort((a, b) => {
      const priceDiff = a.price.sub(b.price);
      if (!priceDiff.eq(0)) {
        return priceDiff.toNumber();
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private getMatchingBidOrders(minPrice: Decimal): Order[] {
    const matchingOrders: Order[] = [];
    
    for (const [priceKey, orders] of this.buyOrders) {
      const price = new Decimal(priceKey);
      if (price.gte(minPrice)) {
        matchingOrders.push(...orders);
      }
    }

    // Sort by price (highest first), then by time (oldest first)
    return matchingOrders.sort((a, b) => {
      const priceDiff = b.price.sub(a.price);
      if (!priceDiff.eq(0)) {
        return priceDiff.toNumber();
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private addToBook(order: Order): void {
    const priceKey = order.price.toString();
    const orderMap = order.type === 'buy' ? this.buyOrders : this.sellOrders;
    
    if (!orderMap.has(priceKey)) {
      orderMap.set(priceKey, []);
    }
    
    orderMap.get(priceKey)!.push(order);
  }

  private removeFromBook(order: Order): void {
    const priceKey = order.price.toString();
    const orderMap = order.type === 'buy' ? this.buyOrders : this.sellOrders;
    
    const orders = orderMap.get(priceKey);
    if (orders) {
      const index = orders.findIndex(o => o.id === order.id);
      if (index !== -1) {
        orders.splice(index, 1);
        
        // Remove price level if no orders left
        if (orders.length === 0) {
          orderMap.delete(priceKey);
        }
      }
    }
  }

  private aggregateOrders(orderMap: Map<string, Order[]>): OrderBookLevel[] {
    const levels: OrderBookLevel[] = [];
    
    for (const [priceKey, orders] of orderMap) {
      const price = new Decimal(priceKey);
      let quantity = new Decimal(0);
      
      for (const order of orders) {
        quantity = quantity.add(order.quantity);
      }
      
      levels.push({
        price,
        quantity,
        orderCount: orders.length
      });
    }
    
    return levels;
  }
}