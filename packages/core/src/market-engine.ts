import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { 
  Market, 
  Outcome, 
  Order, 
  Trade, 
  Position,
  CreateMarketParams,
  MarketSchema,
  OrderType,
  MarketState
} from './schemas.js';
import { LMSREngine } from './lmsr.js';
import { OrderBook } from './order-book.js';

/**
 * Main Market Engine that orchestrates LMSR AMM with order book
 * 
 * This engine provides:
 * - Market creation and lifecycle management
 * - Hybrid AMM + order book trading
 * - Position tracking and PnL calculation
 * - Market resolution and payouts
 */

export interface TradeRequest {
  userId: string;
  marketId: string;
  outcomeId: string;
  type: OrderType;
  quantity: Decimal;
  price?: Decimal; // Optional for market orders
  useAMM?: boolean; // Whether to trade against AMM or place limit order
}

export interface MarketQuote {
  outcomeId: string;
  ammBuyPrice: Decimal;
  ammSellPrice: Decimal;
  orderBookBestBid?: Decimal;
  orderBookBestAsk?: Decimal;
  liquidity: Decimal;
  spread: Decimal;
}

export class MarketEngine {
  private markets: Map<string, Market> = new Map();
  private lmsrEngines: Map<string, LMSREngine> = new Map();
  private orderBooks: Map<string, OrderBook> = new Map(); // marketId_outcomeId -> OrderBook
  private positions: Map<string, Position[]> = new Map(); // userId -> positions
  private trades: Trade[] = [];

  /**
   * Create a new prediction market
   */
  createMarket(params: CreateMarketParams): Market {
    const marketId = randomUUID();
    
    // Create initial outcomes with equal probabilities
    const numOutcomes = params.outcomes.length;
    const initialShares = params.initialLiquidity.div(numOutcomes);
    const initialProbability = new Decimal(1).div(numOutcomes);

    const outcomes: Outcome[] = params.outcomes.map((outcomeData, index) => ({
      id: `${marketId}_outcome_${index}`,
      name: outcomeData.name,
      description: outcomeData.description,
      probability: initialProbability,
      shares: initialShares
    }));

    const market: Market = {
      id: marketId,
      title: params.title,
      description: params.description,
      category: params.category,
      region: params.region,
      type: params.type,
      state: 'active',
      outcomes,
      liquidity: params.initialLiquidity,
      liquidityParameter: params.liquidityParameter,
      createdAt: new Date(),
      resolutionDate: params.resolutionDate,
      metadata: params.metadata
    };

    // Validate the market data
    const validatedMarket = MarketSchema.parse(market);

    // Create LMSR engine for this market
    const lmsrEngine = new LMSREngine(params.liquidityParameter);
    this.lmsrEngines.set(marketId, lmsrEngine);

    // Create order books for each outcome
    outcomes.forEach(outcome => {
      const orderBook = new OrderBook(marketId, outcome.id);
      this.orderBooks.set(`${marketId}_${outcome.id}`, orderBook);
    });

    // Store the market
    this.markets.set(marketId, validatedMarket);

    return validatedMarket;
  }

  /**
   * Get a market by ID
   */
  getMarket(marketId: string): Market | undefined {
    return this.markets.get(marketId);
  }

  /**
   * Get all active markets
   */
  getActiveMarkets(): Market[] {
    return Array.from(this.markets.values()).filter(
      market => market.state === 'active'
    );
  }

  /**
   * Get quote for trading a specific quantity
   */
  getQuote(marketId: string, outcomeId: string, quantity: Decimal, type: OrderType): MarketQuote | null {
    const market = this.markets.get(marketId);
    const lmsrEngine = this.lmsrEngines.get(marketId);
    const orderBook = this.orderBooks.get(`${marketId}_${outcomeId}`);

    if (!market || !lmsrEngine || !orderBook) {
      return null;
    }

    const outcomeIndex = market.outcomes.findIndex(o => o.id === outcomeId);
    if (outcomeIndex === -1) {
      return null;
    }

    // Get AMM prices
    let ammBuyPrice: Decimal;
    let ammSellPrice: Decimal;

    if (type === 'buy') {
      const { cost } = lmsrEngine.calculateBuyCost(market.outcomes, outcomeIndex, quantity);
      ammBuyPrice = cost.div(quantity);
      const { payout } = lmsrEngine.calculateSellPayout(market.outcomes, outcomeIndex, quantity);
      ammSellPrice = payout.div(quantity);
    } else {
      const { payout } = lmsrEngine.calculateSellPayout(market.outcomes, outcomeIndex, quantity);
      ammSellPrice = payout.div(quantity);
      const { cost } = lmsrEngine.calculateBuyCost(market.outcomes, outcomeIndex, quantity);
      ammBuyPrice = cost.div(quantity);
    }

    // Get order book best prices
    const { bestBid, bestAsk } = orderBook.getBestPrices();

    // Calculate liquidity and spread
    const liquidity = lmsrEngine.calculateLiquidity(market.outcomes);
    const spread = ammBuyPrice.sub(ammSellPrice);

    return {
      outcomeId,
      ammBuyPrice,
      ammSellPrice,
      orderBookBestBid: bestBid,
      orderBookBestAsk: bestAsk,
      liquidity,
      spread
    };
  }

  /**
   * Execute a trade (market order against AMM or limit order)
   */
  executeTrade(request: TradeRequest): { 
    trades: Trade[]; 
    updatedMarket?: Market; 
    order?: Order 
  } {
    const market = this.markets.get(request.marketId);
    const lmsrEngine = this.lmsrEngines.get(request.marketId);

    if (!market || !lmsrEngine || market.state !== 'active') {
      throw new Error('Market not found or not active');
    }

    const outcomeIndex = market.outcomes.findIndex(o => o.id === request.outcomeId);
    if (outcomeIndex === -1) {
      throw new Error('Outcome not found');
    }

    // If using AMM or market order without specified price
    if (request.useAMM || !request.price) {
      return this.executeAMMTrade(request, market, lmsrEngine, outcomeIndex);
    } else {
      // Place limit order in order book
      return this.placeLimitOrder(request);
    }
  }

  /**
   * Get user positions across all markets
   */
  getUserPositions(userId: string): Position[] {
    return this.positions.get(userId) || [];
  }

  /**
   * Calculate user's total PnL across all positions
   */
  calculateUserPnL(userId: string): { unrealized: Decimal; realized: Decimal } {
    const userPositions = this.getUserPositions(userId);
    
    let unrealized = new Decimal(0);
    let realized = new Decimal(0);

    for (const position of userPositions) {
      unrealized = unrealized.add(position.unrealizedPnl);
      realized = realized.add(position.realizedPnl);
    }

    return { unrealized, realized };
  }

  /**
   * Resolve a market with the winning outcome
   */
  resolveMarket(marketId: string, winningOutcomeId: string): Map<string, Decimal> {
    const market = this.markets.get(marketId);
    if (!market || market.state !== 'active') {
      throw new Error('Market not found or not resolvable');
    }

    const winningIndex = market.outcomes.findIndex(o => o.id === winningOutcomeId);
    if (winningIndex === -1) {
      throw new Error('Winning outcome not found');
    }

    // Update market state
    market.state = 'resolved';
    market.resolvedOutcome = winningOutcomeId;

    // Calculate payouts for all users
    const userPositions = new Map<string, { outcomeIndex: number; shares: Decimal }[]>();
    
    for (const [userId, positions] of this.positions) {
      const marketPositions = positions
        .filter(p => p.marketId === marketId)
        .map(p => ({
          outcomeIndex: market.outcomes.findIndex(o => o.id === p.outcomeId),
          shares: p.shares
        }))
        .filter(p => p.outcomeIndex !== -1);

      if (marketPositions.length > 0) {
        userPositions.set(userId, marketPositions);
      }
    }

    const lmsrEngine = this.lmsrEngines.get(marketId)!;
    const payouts = lmsrEngine.resolveMarket(market.outcomes, winningIndex, userPositions);

    return payouts;
  }

  /**
   * Pause trading on a market
   */
  pauseMarket(marketId: string): boolean {
    const market = this.markets.get(marketId);
    if (!market || market.state !== 'active') {
      return false;
    }

    market.state = 'paused';
    return true;
  }

  /**
   * Resume trading on a market
   */
  resumeMarket(marketId: string): boolean {
    const market = this.markets.get(marketId);
    if (!market || market.state !== 'paused') {
      return false;
    }

    market.state = 'active';
    return true;
  }

  private executeAMMTrade(
    request: TradeRequest, 
    market: Market, 
    lmsrEngine: LMSREngine, 
    outcomeIndex: number
  ): { trades: Trade[]; updatedMarket: Market } {
    let cost: Decimal;
    let newPrices: Decimal[];

    if (request.type === 'buy') {
      const result = lmsrEngine.calculateBuyCost(market.outcomes, outcomeIndex, request.quantity);
      cost = result.cost;
      newPrices = result.newPrices;
      
      // Update market shares
      market.outcomes[outcomeIndex].shares = market.outcomes[outcomeIndex].shares.add(request.quantity);
    } else {
      const result = lmsrEngine.calculateSellPayout(market.outcomes, outcomeIndex, request.quantity);
      cost = result.payout.neg(); // Negative cost for sell (it's a payout)
      newPrices = result.newPrices;
      
      // Update market shares
      market.outcomes[outcomeIndex].shares = market.outcomes[outcomeIndex].shares.sub(request.quantity);
    }

    // Update outcome probabilities
    market.outcomes.forEach((outcome, i) => {
      outcome.probability = newPrices[i];
    });

    // Create trade record
    const trade: Trade = {
      id: randomUUID(),
      marketId: request.marketId,
      outcomeId: request.outcomeId,
      buyerId: request.type === 'buy' ? request.userId : 'AMM',
      sellerId: request.type === 'sell' ? request.userId : 'AMM',
      quantity: request.quantity,
      price: cost.abs().div(request.quantity),
      timestamp: new Date()
    };

    this.trades.push(trade);

    // Update user position
    this.updateUserPosition(request.userId, trade, request.type);

    return { trades: [trade], updatedMarket: market };
  }

  private placeLimitOrder(request: TradeRequest): { order: Order; trades: Trade[] } {
    if (!request.price) {
      throw new Error('Price required for limit orders');
    }

    const order: Order = {
      id: randomUUID(),
      marketId: request.marketId,
      outcomeId: request.outcomeId,
      userId: request.userId,
      type: request.type,
      quantity: request.quantity,
      price: request.price,
      status: 'pending',
      filledQuantity: new Decimal(0),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const orderBook = this.orderBooks.get(`${request.marketId}_${request.outcomeId}`);
    if (!orderBook) {
      throw new Error('Order book not found');
    }

    const { trades, remainingOrder } = orderBook.addOrder(order);

    // Update positions for any executed trades
    trades.forEach(trade => {
      this.trades.push(trade);
      
      // Update buyer position
      this.updateUserPosition(trade.buyerId, trade, 'buy');
      
      // Update seller position  
      this.updateUserPosition(trade.sellerId, trade, 'sell');
    });

    return { order: remainingOrder || order, trades };
  }

  private updateUserPosition(userId: string, trade: Trade, side: OrderType): void {
    if (!this.positions.has(userId)) {
      this.positions.set(userId, []);
    }

    const userPositions = this.positions.get(userId)!;
    let position = userPositions.find(
      p => p.marketId === trade.marketId && p.outcomeId === trade.outcomeId
    );

    if (!position) {
      position = {
        userId,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        shares: new Decimal(0),
        avgPrice: new Decimal(0),
        unrealizedPnl: new Decimal(0),
        realizedPnl: new Decimal(0)
      };
      userPositions.push(position);
    }

    const quantity = trade.quantity;
    const price = trade.price;

    if (side === 'buy') {
      // Update average price for new shares
      const totalShares = position.shares.add(quantity);
      const totalValue = position.shares.mul(position.avgPrice).add(quantity.mul(price));
      
      position.avgPrice = totalShares.gt(0) ? totalValue.div(totalShares) : new Decimal(0);
      position.shares = totalShares;
    } else {
      // Selling shares - realize PnL
      const sellValue = quantity.mul(price);
      const costBasis = quantity.mul(position.avgPrice);
      const realizedPnl = sellValue.sub(costBasis);
      
      position.shares = position.shares.sub(quantity);
      position.realizedPnl = position.realizedPnl.add(realizedPnl);
      
      // If position is closed, reset average price
      if (position.shares.lte(0)) {
        position.avgPrice = new Decimal(0);
        position.shares = new Decimal(0);
      }
    }

    // Update unrealized PnL (will be calculated based on current market price)
    // This would typically be done in a separate method called periodically
  }
}