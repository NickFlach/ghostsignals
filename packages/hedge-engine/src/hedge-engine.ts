import Decimal from 'decimal.js';
import {
  ExpenseProfile,
  HedgingBasket,
  RebalanceRecommendation,
  OptimizationConstraints,
  PerformanceMetrics,
  HedgingPosition
} from './schemas.js';
import { Market, MarketEngine, MarketQuote } from '@ghostsignals/core';
import { ExpenseProfiler, ImportedTransaction } from './expense-profiler.js';
import { PortfolioOptimizer, MarketData } from './portfolio-optimizer.js';

/**
 * Main Hedge Engine - Orchestrates personalized hedging strategy
 * 
 * This is the primary interface for users to:
 * - Create and manage expense profiles
 * - Generate optimal hedging baskets
 * - Monitor and rebalance positions
 * - Track hedging effectiveness
 */

export interface HedgeEngineConfig {
  defaultRiskTolerance: number;
  defaultRebalanceThreshold: number;
  maxPositionsPerBasket: number;
  minHedgingBudget: Decimal;
  rebalanceCheckFrequencyHours: number;
}

export interface BasketPerformance {
  totalReturn: Decimal;
  hedgingEffectiveness: Decimal;
  stabilityScore: Decimal;
  expenseVarianceReduction: Decimal;
  lastUpdated: Date;
}

export class HedgeEngine {
  private expenseProfiler: ExpenseProfiler;
  private portfolioOptimizer: PortfolioOptimizer;
  private profiles: Map<string, ExpenseProfile> = new Map();
  private baskets: Map<string, HedgingBasket> = new Map();
  private performanceHistory: Map<string, PerformanceMetrics[]> = new Map();

  constructor(
    private marketEngine: MarketEngine,
    private config: HedgeEngineConfig
  ) {
    this.expenseProfiler = new ExpenseProfiler();
    this.portfolioOptimizer = new PortfolioOptimizer();
  }

  /**
   * Create expense profile from transaction data
   */
  createExpenseProfile(
    userId: string,
    transactions: ImportedTransaction[],
    riskTolerance?: number,
    hedgingBudget?: Decimal,
    profileName: string = 'Main Profile'
  ): ExpenseProfile {
    const profile = this.expenseProfiler.createProfileFromTransactions(
      userId,
      transactions,
      riskTolerance ?? this.config.defaultRiskTolerance,
      hedgingBudget ?? this.config.minHedgingBudget,
      profileName
    );

    this.profiles.set(profile.userId, profile);
    return profile;
  }

  /**
   * Update existing profile with new transaction data
   */
  updateExpenseProfile(
    userId: string,
    newTransactions: ImportedTransaction[]
  ): ExpenseProfile {
    const existingProfile = this.profiles.get(userId);
    if (!existingProfile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    const updatedProfile = this.expenseProfiler.updateProfile(
      existingProfile,
      newTransactions
    );

    this.profiles.set(userId, updatedProfile);
    return updatedProfile;
  }

  /**
   * Generate optimal hedging basket for a user
   */
  async generateHedgingBasket(
    userId: string,
    constraints?: OptimizationConstraints
  ): Promise<HedgingBasket> {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    // Get available markets
    const markets = this.marketEngine.getActiveMarkets();
    const marketData = await this.prepareMarketData(markets);

    // Use default constraints if not provided
    const optimizationConstraints = constraints ?? this.getDefaultConstraints();

    // Run optimization
    const result = this.portfolioOptimizer.optimizeBasket(
      profile,
      marketData,
      optimizationConstraints
    );

    if (!result.feasible) {
      throw new Error('Unable to generate feasible hedging basket with current constraints');
    }

    // Create hedging basket
    const basket: HedgingBasket = {
      userId,
      profileId: profile.userId,
      positions: result.positions,
      totalValue: result.totalCost,
      totalCost: result.totalCost,
      stabilityScore: result.stabilityScore,
      hedgingEffectiveness: this.calculateHedgingEffectiveness(result.positions, profile),
      lastRebalance: new Date(),
      nextRebalanceCheck: this.calculateNextRebalanceCheck(),
      rebalanceCount: 0
    };

    this.baskets.set(userId, basket);
    return basket;
  }

  /**
   * Check if basket needs rebalancing
   */
  checkRebalanceNeeded(userId: string): RebalanceRecommendation {
    const basket = this.baskets.get(userId);
    const profile = this.profiles.get(userId);

    if (!basket || !profile) {
      return {
        recommendRebalance: false,
        reason: 'Profile or basket not found',
        currentStabilityScore: new Decimal(0),
        projectedStabilityScore: new Decimal(0),
        estimatedCost: new Decimal(0),
        urgency: 'low',
        suggestedActions: []
      };
    }

    // Calculate current metrics
    const currentStabilityScore = basket.stabilityScore;
    const targetStabilityScore = new Decimal(0.8); // 80% variance reduction target

    // Check various rebalancing triggers
    const triggers = this.evaluateRebalanceTriggers(basket, profile);

    if (triggers.length === 0) {
      return {
        recommendRebalance: false,
        reason: 'Portfolio is well balanced',
        currentStabilityScore,
        projectedStabilityScore: currentStabilityScore,
        estimatedCost: new Decimal(0),
        urgency: 'low',
        suggestedActions: []
      };
    }

    // Estimate cost and benefit of rebalancing
    const rebalancingCost = this.estimateRebalancingCost(basket);
    const projectedImprovement = this.estimateStabilityImprovement(basket, profile);

    // Generate specific recommendations
    const suggestedActions = this.generateRebalanceActions(basket, profile);

    const urgency = this.determineUrgency(triggers, currentStabilityScore, targetStabilityScore);

    return {
      recommendRebalance: true,
      reason: triggers.join('; '),
      currentStabilityScore,
      projectedStabilityScore: currentStabilityScore.add(projectedImprovement),
      estimatedCost: rebalancingCost,
      urgency,
      suggestedActions
    };
  }

  /**
   * Execute rebalancing of user's basket
   */
  async rebalanceBasket(userId: string): Promise<HedgingBasket> {
    const currentBasket = this.baskets.get(userId);
    const profile = this.profiles.get(userId);

    if (!currentBasket || !profile) {
      throw new Error('Basket or profile not found');
    }

    // Get current market data
    const markets = this.marketEngine.getActiveMarkets();
    const marketData = await this.prepareMarketData(markets);

    // Run rebalancing optimization
    const result = this.portfolioOptimizer.rebalanceBasket(
      currentBasket,
      profile,
      marketData,
      this.getDefaultConstraints()
    );

    // Update basket
    const rebalancedBasket: HedgingBasket = {
      ...currentBasket,
      positions: result.positions,
      totalValue: result.totalCost,
      totalCost: result.totalCost,
      stabilityScore: result.stabilityScore,
      hedgingEffectiveness: this.calculateHedgingEffectiveness(result.positions, profile),
      lastRebalance: new Date(),
      nextRebalanceCheck: this.calculateNextRebalanceCheck(),
      rebalanceCount: currentBasket.rebalanceCount + 1
    };

    this.baskets.set(userId, rebalancedBasket);
    return rebalancedBasket;
  }

  /**
   * Get current basket performance
   */
  getBasketPerformance(userId: string): BasketPerformance | null {
    const basket = this.baskets.get(userId);
    if (!basket) return null;

    // Calculate current performance metrics
    const currentValue = this.calculateCurrentBasketValue(basket);
    const totalReturn = currentValue.sub(basket.totalCost).div(basket.totalCost);

    return {
      totalReturn,
      hedgingEffectiveness: basket.hedgingEffectiveness,
      stabilityScore: basket.stabilityScore,
      expenseVarianceReduction: basket.stabilityScore.mul(100), // Convert to percentage
      lastUpdated: new Date()
    };
  }

  /**
   * Simulate basket performance over time
   */
  simulateBasketPerformance(
    userId: string,
    simulationDays: number,
    scenarios: number = 1000
  ): {
    expectedStabilityScore: Decimal;
    stabilityScoreRange: [Decimal, Decimal];
    expectedVarianceReduction: Decimal;
    winRate: Decimal; // % of scenarios where hedging helped
  } {
    const basket = this.baskets.get(userId);
    const profile = this.profiles.get(userId);

    if (!basket || !profile) {
      throw new Error('Basket or profile not found');
    }

    // Monte Carlo simulation
    let totalStabilityScore = new Decimal(0);
    let totalVarianceReduction = new Decimal(0);
    let helpfulScenarios = 0;
    const stabilityScores: Decimal[] = [];

    for (let i = 0; i < scenarios; i++) {
      const scenarioResult = this.runScenario(basket, profile, simulationDays);
      
      totalStabilityScore = totalStabilityScore.add(scenarioResult.stabilityScore);
      totalVarianceReduction = totalVarianceReduction.add(scenarioResult.varianceReduction);
      
      if (scenarioResult.stabilityScore.gt(0)) {
        helpfulScenarios++;
      }
      
      stabilityScores.push(scenarioResult.stabilityScore);
    }

    // Calculate statistics
    stabilityScores.sort((a, b) => a.sub(b).toNumber());
    const percentile5 = stabilityScores[Math.floor(scenarios * 0.05)];
    const percentile95 = stabilityScores[Math.floor(scenarios * 0.95)];

    return {
      expectedStabilityScore: totalStabilityScore.div(scenarios),
      stabilityScoreRange: [percentile5, percentile95],
      expectedVarianceReduction: totalVarianceReduction.div(scenarios),
      winRate: new Decimal(helpfulScenarios).div(scenarios)
    };
  }

  /**
   * Get user's expense profile
   */
  getExpenseProfile(userId: string): ExpenseProfile | null {
    return this.profiles.get(userId) || null;
  }

  /**
   * Get user's hedging basket
   */
  getHedgingBasket(userId: string): HedgingBasket | null {
    return this.baskets.get(userId) || null;
  }

  /**
   * Predict future expenses
   */
  predictFutureExpenses(userId: string, monthsAhead: number) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    return this.expenseProfiler.predictFutureExpenses(profile, monthsAhead);
  }

  private async prepareMarketData(markets: Market[]): Promise<MarketData[]> {
    const marketData: MarketData[] = [];

    for (const market of markets) {
      // Get market quotes for price and liquidity info
      const quotes: MarketQuote[] = [];
      for (const outcome of market.outcomes) {
        const quote = this.marketEngine.getQuote(
          market.id,
          outcome.id,
          new Decimal(100),
          'buy'
        );
        if (quote) quotes.push(quote);
      }

      if (quotes.length === 0) continue;

      // Calculate market metrics
      const avgPrice = quotes.reduce((sum, q) => sum.add(q.ammBuyPrice), new Decimal(0))
        .div(quotes.length);
      
      const avgLiquidity = quotes.reduce((sum, q) => sum.add(q.liquidity), new Decimal(0))
        .div(quotes.length);

      // Estimate correlations (simplified - would use historical data in practice)
      const correlationWithCategory = this.estimateMarketCorrelations(market);

      marketData.push({
        market,
        expectedReturn: new Decimal(0), // Hedging positions target zero return
        volatility: new Decimal(0.2), // Default 20% volatility
        correlationWithCategory,
        liquidityScore: avgLiquidity.div(1000), // Normalize liquidity score
        currentPrice: avgPrice
      });
    }

    return marketData;
  }

  private estimateMarketCorrelations(market: Market) {
    const correlations = new Map();
    
    // Simple heuristic based on market category and region
    // In practice, this would use historical price data
    const baseCorrelation = -0.3; // Negative for hedging
    
    correlations.set(market.category, new Decimal(baseCorrelation));
    
    // Related categories have some correlation
    const relatedCategories = this.getRelatedCategories(market.category);
    for (const related of relatedCategories) {
      correlations.set(related, new Decimal(baseCorrelation * 0.3));
    }

    return correlations;
  }

  private getRelatedCategories(category: string): string[] {
    const relationships: Record<string, string[]> = {
      food: ['materials'],
      housing: ['energy'],
      energy: ['housing', 'transport'],
      transport: ['energy'],
      healthcare: [],
      tech: ['materials'],
      materials: ['food', 'tech']
    };

    return relationships[category] || [];
  }

  private calculateHedgingEffectiveness(
    positions: HedgingPosition[],
    profile: ExpenseProfile
  ): Decimal {
    // Simplified calculation - would use actual correlation analysis in practice
    let totalHedgeValue = new Decimal(0);
    let totalExposure = new Decimal(0);

    for (const expense of profile.expenses) {
      const monthlyAmount = this.normalizeToMonthly(expense.amount, expense.frequency);
      totalExposure = totalExposure.add(monthlyAmount);

      // Find hedging positions for this expense category
      const relevantPositions = positions.filter(pos => {
        return pos.marketCategory === expense.category;
      });

      for (const position of relevantPositions) {
        const hedgeValue = position.hedgeRatio.mul(position.shares).mul(position.costBasis.div(position.shares));
        totalHedgeValue = totalHedgeValue.add(hedgeValue);
      }
    }

    return totalExposure.gt(0) ? totalHedgeValue.div(totalExposure) : new Decimal(0);
  }

  private evaluateRebalanceTriggers(basket: HedgingBasket, profile: ExpenseProfile): string[] {
    const triggers: string[] = [];

    // Check time since last rebalance
    const daysSinceRebalance = (Date.now() - basket.lastRebalance.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceRebalance > 30) {
      triggers.push('30+ days since last rebalance');
    }

    // Check stability score degradation
    const targetStability = new Decimal(0.8);
    if (basket.stabilityScore.lt(targetStability.mul(0.9))) {
      triggers.push('Stability score below 90% of target');
    }

    // Check position drift
    const totalValue = basket.totalValue;
    let maxDrift = new Decimal(0);
    
    for (const position of basket.positions) {
      const currentWeight = position.actualWeight;
      const targetWeight = position.targetWeight;
      const drift = currentWeight.sub(targetWeight).abs();
      
      maxDrift = Decimal.max(maxDrift, drift);
    }

    if (maxDrift.gt(profile.rebalanceThreshold)) {
      triggers.push(`Position drift (${maxDrift.mul(100).toFixed(1)}%) exceeds threshold`);
    }

    return triggers;
  }

  private estimateRebalancingCost(basket: HedgingBasket): Decimal {
    // Simple cost estimation - spread costs + gas fees
    return basket.totalValue.mul(0.005); // 0.5% of portfolio value
  }

  private estimateStabilityImprovement(basket: HedgingBasket, profile: ExpenseProfile): Decimal {
    // Estimate potential improvement from rebalancing
    return new Decimal(0.05); // 5% improvement estimate
  }

  private generateRebalanceActions(basket: HedgingBasket, profile: ExpenseProfile) {
    // Generate specific buy/sell recommendations
    return basket.positions.map(position => ({
      type: 'hold' as const,
      marketId: position.marketId,
      outcomeId: position.outcomeId,
      currentShares: position.shares,
      targetShares: position.shares, // Simplified
      estimatedCost: new Decimal(0)
    }));
  }

  private determineUrgency(
    triggers: string[],
    currentStability: Decimal,
    targetStability: Decimal
  ): 'low' | 'medium' | 'high' {
    if (triggers.length >= 3) return 'high';
    if (currentStability.lt(targetStability.mul(0.7))) return 'high';
    if (triggers.length >= 2) return 'medium';
    return 'low';
  }

  private calculateCurrentBasketValue(basket: HedgingBasket): Decimal {
    // Would query current market prices in practice
    return basket.totalCost.mul(1.02); // Assume 2% gain for simplicity
  }

  private calculateNextRebalanceCheck(): Date {
    const next = new Date();
    next.setHours(next.getHours() + this.config.rebalanceCheckFrequencyHours);
    return next;
  }

  private runScenario(
    basket: HedgingBasket,
    profile: ExpenseProfile,
    days: number
  ): { stabilityScore: Decimal; varianceReduction: Decimal } {
    // Monte Carlo scenario simulation
    // Simplified implementation
    const randomFactor = Math.random() * 0.4 - 0.2; // ±20% random variation
    const baseStability = basket.stabilityScore;
    const scenarioStability = baseStability.add(randomFactor);
    
    return {
      stabilityScore: Decimal.max(new Decimal(0), scenarioStability),
      varianceReduction: scenarioStability.mul(0.5)
    };
  }

  private getDefaultConstraints(): OptimizationConstraints {
    return {
      maxPositionsPerCategory: 3,
      minPositionSize: new Decimal(10),
      maxPositionSize: new Decimal(1000),
      maxConcentration: 0.3,
      targetVolatilityReduction: 0.5,
      rebalanceCostThreshold: new Decimal(5)
    };
  }

  private normalizeToMonthly(amount: Decimal, frequency: string): Decimal {
    const multipliers: Record<string, number> = {
      daily: 30.44,
      weekly: 4.33,
      monthly: 1,
      quarterly: 1/3,
      annually: 1/12,
      'one-time': 0
    };

    return amount.mul(multipliers[frequency] || 1);
  }
}