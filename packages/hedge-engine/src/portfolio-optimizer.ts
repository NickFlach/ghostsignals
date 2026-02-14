import Decimal from 'decimal.js';
import {
  ExpenseProfile,
  HedgingBasket,
  HedgingPosition,
  OptimizationConstraints,
  OptimizationResult,
  EXPENSE_TO_MARKET_CATEGORY
} from './schemas.js';
import { Market, MarketCategory, Region } from '@ghostsignals/core';

/**
 * Portfolio Optimizer - Constructs optimal hedging baskets
 * 
 * This engine implements mean-variance optimization to construct personalized
 * hedging baskets that minimize: Var(net_cost) = Var(E) + Var(P) - 2·Cov(E,P)
 * 
 * Where:
 * - E = user's expense vector
 * - P = market position vector
 * - Goal is to maximize negative correlation between expenses and market positions
 */

export interface MarketData {
  market: Market;
  expectedReturn: Decimal;
  volatility: Decimal;
  correlationWithCategory: Map<MarketCategory, Decimal>;
  liquidityScore: Decimal;
  currentPrice: Decimal;
}

export interface ExpenseCovarianceMatrix {
  categories: MarketCategory[];
  matrix: Decimal[][];
}

export class PortfolioOptimizer {
  
  /**
   * Optimize hedging basket for a given expense profile
   */
  optimizeBasket(
    profile: ExpenseProfile,
    availableMarkets: MarketData[],
    constraints: OptimizationConstraints,
    currentBasket?: HedgingBasket
  ): OptimizationResult {
    const startTime = Date.now();
    
    try {
      // Calculate expense exposures by category
      const expenseExposures = this.calculateExpenseExposures(profile);
      
      // Build covariance matrix for expense categories
      const expenseCovariance = this.estimateExpenseCovariance(profile, expenseExposures);
      
      // Filter and score available markets
      const candidateMarkets = this.scoreMarkets(availableMarkets, expenseExposures);
      
      // Run optimization algorithm
      const optimalPositions = this.optimizePositions(
        expenseExposures,
        candidateMarkets,
        constraints,
        profile.hedgingBudget,
        expenseCovariance
      );
      
      // Calculate portfolio metrics
      const metrics = this.calculatePortfolioMetrics(
        optimalPositions,
        expenseExposures,
        candidateMarkets,
        expenseCovariance
      );
      
      const computeTimeMs = Date.now() - startTime;
      
      return {
        positions: optimalPositions,
        expectedReturn: metrics.expectedReturn,
        expectedVolatility: metrics.expectedVolatility,
        hedgedVolatility: metrics.hedgedVolatility,
        stabilityScore: metrics.stabilityScore,
        totalCost: metrics.totalCost,
        feasible: metrics.feasible,
        optimizationMethod: 'mean-variance-hedge',
        computeTimeMs
      };
      
    } catch (error) {
      return {
        positions: [],
        expectedReturn: new Decimal(0),
        expectedVolatility: new Decimal(0),
        hedgedVolatility: new Decimal(0),
        stabilityScore: new Decimal(0),
        totalCost: new Decimal(0),
        feasible: false,
        optimizationMethod: 'mean-variance-hedge',
        computeTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate stability score: S = 1 - σ(hedged)/σ(unhedged)
   */
  calculateStabilityScore(
    unhedgedVolatility: Decimal,
    hedgedVolatility: Decimal
  ): Decimal {
    if (unhedgedVolatility.lte(0)) return new Decimal(0);
    
    const ratio = hedgedVolatility.div(unhedgedVolatility);
    return new Decimal(1).sub(ratio);
  }

  /**
   * Rebalance existing basket based on new conditions
   */
  rebalanceBasket(
    currentBasket: HedgingBasket,
    profile: ExpenseProfile,
    availableMarkets: MarketData[],
    constraints: OptimizationConstraints
  ): OptimizationResult {
    // Run optimization with current positions as starting point
    const result = this.optimizeBasket(profile, availableMarkets, constraints, currentBasket);
    
    // Add rebalancing-specific logic
    result.positions = this.applyRebalancingLogic(
      currentBasket.positions,
      result.positions,
      constraints
    );
    
    return result;
  }

  private calculateExpenseExposures(profile: ExpenseProfile): Map<MarketCategory, Decimal> {
    const exposures = new Map<MarketCategory, Decimal>();
    
    for (const expense of profile.expenses) {
      const marketCategory = EXPENSE_TO_MARKET_CATEGORY[expense.category];
      const monthlyAmount = this.normalizeToMonthly(expense.amount, expense.frequency);
      
      const currentExposure = exposures.get(marketCategory) || new Decimal(0);
      exposures.set(marketCategory, currentExposure.add(monthlyAmount));
    }
    
    return exposures;
  }

  private estimateExpenseCovariance(
    profile: ExpenseProfile,
    exposures: Map<MarketCategory, Decimal>
  ): ExpenseCovarianceMatrix {
    const categories = Array.from(exposures.keys());
    const n = categories.length;
    const matrix: Decimal[][] = Array(n).fill(null).map(() => Array(n).fill(new Decimal(0)));
    
    // Build covariance matrix based on historical correlations and user data
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          // Diagonal: variance of category
          const exposure = exposures.get(categories[i])!;
          const volatility = this.estimateCategoryVolatility(categories[i], profile);
          matrix[i][j] = exposure.mul(volatility).pow(2);
        } else {
          // Off-diagonal: covariance between categories
          const corr = this.getCategoryCorrelation(categories[i], categories[j]);
          const vol1 = this.estimateCategoryVolatility(categories[i], profile);
          const vol2 = this.estimateCategoryVolatility(categories[j], profile);
          const exp1 = exposures.get(categories[i])!;
          const exp2 = exposures.get(categories[j])!;
          
          matrix[i][j] = exp1.mul(exp2).mul(vol1).mul(vol2).mul(corr);
        }
      }
    }
    
    return { categories, matrix };
  }

  private scoreMarkets(
    markets: MarketData[],
    expenseExposures: Map<MarketCategory, Decimal>
  ): MarketData[] {
    return markets
      .filter(market => {
        // Filter markets relevant to user's expense categories
        return Array.from(expenseExposures.keys()).some(category => {
          const correlation = market.correlationWithCategory.get(category) || new Decimal(0);
          return correlation.abs().gt(0.1); // Minimum correlation threshold
        });
      })
      .sort((a, b) => {
        // Sort by hedging potential (negative correlation with expenses)
        const scoreA = this.calculateHedgingScore(a, expenseExposures);
        const scoreB = this.calculateHedgingScore(b, expenseExposures);
        return scoreB.sub(scoreA).toNumber();
      });
  }

  private calculateHedgingScore(
    market: MarketData,
    expenseExposures: Map<MarketCategory, Decimal>
  ): Decimal {
    let score = new Decimal(0);
    let totalExposure = new Decimal(0);
    
    for (const [category, exposure] of expenseExposures) {
      const correlation = market.correlationWithCategory.get(category) || new Decimal(0);
      
      // We want negative correlation for hedging
      const hedgeValue = correlation.neg().mul(exposure);
      score = score.add(hedgeValue);
      totalExposure = totalExposure.add(exposure);
    }
    
    // Normalize by total exposure and adjust for liquidity
    if (totalExposure.gt(0)) {
      score = score.div(totalExposure);
    }
    
    // Boost score for liquid markets
    const liquidityBoost = market.liquidityScore.mul(0.1);
    score = score.add(liquidityBoost);
    
    return score;
  }

  private optimizePositions(
    expenseExposures: Map<MarketCategory, Decimal>,
    candidateMarkets: MarketData[],
    constraints: OptimizationConstraints,
    budget: Decimal,
    expenseCovariance: ExpenseCovarianceMatrix
  ): HedgingPosition[] {
    const positions: HedgingPosition[] = [];
    let remainingBudget = budget;
    
    // Greedy optimization approach (simplified - in practice would use quadratic programming)
    const categoriesOrdered = Array.from(expenseExposures.entries())
      .sort(([, a], [, b]) => b.sub(a).toNumber()); // Largest exposures first
    
    for (const [category, exposure] of categoriesOrdered) {
      const relevantMarkets = candidateMarkets.filter(market => {
        const correlation = market.correlationWithCategory.get(category) || new Decimal(0);
        return correlation.lt(new Decimal(-0.1)); // Only negative correlation for hedging
      });
      
      if (relevantMarkets.length === 0) continue;
      
      // Allocate budget proportional to exposure
      const totalExposure = Array.from(expenseExposures.values())
        .reduce((sum, exp) => sum.add(exp), new Decimal(0));
      
      const categoryBudget = budget.mul(exposure).div(totalExposure);
      const actualBudget = Decimal.min(categoryBudget, remainingBudget);
      
      if (actualBudget.lt(constraints.minPositionSize)) continue;
      
      // Select best market for this category
      const bestMarket = relevantMarkets[0]; // Already sorted by hedging score
      
      // Calculate position size
      const maxPositions = Math.min(
        constraints.maxPositionsPerCategory,
        relevantMarkets.length
      );
      
      const positionBudget = actualBudget.div(maxPositions);
      
      if (positionBudget.gte(constraints.minPositionSize) && 
          positionBudget.lte(constraints.maxPositionSize)) {
        
        // Calculate shares to buy
        const shares = positionBudget.div(bestMarket.currentPrice);
        const correlation = bestMarket.correlationWithCategory.get(category)!;
        const hedgeRatio = correlation.abs();
        
        const position: HedgingPosition = {
          marketId: bestMarket.market.id,
          outcomeId: bestMarket.market.outcomes[0].id, // Simplified: use first outcome
          marketCategory: category,
          region: bestMarket.market.region,
          shares,
          costBasis: positionBudget,
          targetWeight: positionBudget.div(budget),
          actualWeight: positionBudget.div(budget),
          hedgeRatio,
          lastUpdated: new Date()
        };
        
        positions.push(position);
        remainingBudget = remainingBudget.sub(positionBudget);
      }
    }
    
    return positions;
  }

  private calculatePortfolioMetrics(
    positions: HedgingPosition[],
    expenseExposures: Map<MarketCategory, Decimal>,
    marketData: MarketData[],
    expenseCovariance: ExpenseCovarianceMatrix
  ): {
    expectedReturn: Decimal;
    expectedVolatility: Decimal;
    hedgedVolatility: Decimal;
    stabilityScore: Decimal;
    totalCost: Decimal;
    feasible: boolean;
  } {
    const totalCost = positions.reduce(
      (sum, pos) => sum.add(pos.costBasis),
      new Decimal(0)
    );
    
    // Calculate expected return (should be near zero for hedging portfolio)
    const expectedReturn = positions.reduce((sum, pos) => {
      const market = marketData.find(m => m.market.id === pos.marketId);
      if (!market) return sum;
      
      const positionReturn = market.expectedReturn.mul(pos.shares).mul(market.currentPrice);
      return sum.add(positionReturn);
    }, new Decimal(0));
    
    // Calculate unhedged expense volatility
    const unhedgedVol = this.calculateExpenseVolatility(expenseExposures, expenseCovariance);
    
    // Calculate hedged volatility (simplified)
    const hedgeReduction = positions.reduce((reduction, pos) => {
      const category = pos.marketCategory as MarketCategory;
      const exposure = expenseExposures.get(category) || new Decimal(0);
      const hedgeValue = pos.hedgeRatio.mul(pos.shares).mul(pos.costBasis.div(pos.shares));
      
      return reduction.add(hedgeValue.mul(exposure).div(totalCost.add(1))); // Avoid division by zero
    }, new Decimal(0));
    
    const hedgedVol = unhedgedVol.mul(new Decimal(1).sub(hedgeReduction));
    const stabilityScore = this.calculateStabilityScore(unhedgedVol, hedgedVol);
    
    return {
      expectedReturn,
      expectedVolatility: unhedgedVol,
      hedgedVolatility: hedgedVol,
      stabilityScore,
      totalCost,
      feasible: positions.length > 0 && totalCost.lte(positions[0].costBasis.mul(100)) // Basic feasibility check
    };
  }

  private calculateExpenseVolatility(
    expenseExposures: Map<MarketCategory, Decimal>,
    expenseCovariance: ExpenseCovarianceMatrix
  ): Decimal {
    // Calculate portfolio volatility: sqrt(w' * Σ * w)
    const categories = expenseCovariance.categories;
    let totalVariance = new Decimal(0);
    
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories.length; j++) {
        const weight1 = expenseExposures.get(categories[i]) || new Decimal(0);
        const weight2 = expenseExposures.get(categories[j]) || new Decimal(0);
        const covariance = expenseCovariance.matrix[i][j];
        
        totalVariance = totalVariance.add(weight1.mul(weight2).mul(covariance));
      }
    }
    
    return totalVariance.sqrt();
  }

  private applyRebalancingLogic(
    currentPositions: HedgingPosition[],
    newPositions: HedgingPosition[],
    constraints: OptimizationConstraints
  ): HedgingPosition[] {
    // Only rebalance if cost-benefit is favorable
    const rebalancingPositions: HedgingPosition[] = [];
    
    for (const newPos of newPositions) {
      const currentPos = currentPositions.find(
        p => p.marketId === newPos.marketId && p.outcomeId === newPos.outcomeId
      );
      
      if (!currentPos) {
        // New position
        rebalancingPositions.push(newPos);
      } else {
        // Check if rebalancing is worth the cost
        const sizeDiff = newPos.shares.sub(currentPos.shares).abs();
        const costDiff = sizeDiff.mul(newPos.costBasis.div(newPos.shares.add(1)));
        
        if (costDiff.gte(constraints.rebalanceCostThreshold)) {
          // Update existing position
          rebalancingPositions.push({
            ...currentPos,
            shares: newPos.shares,
            targetWeight: newPos.targetWeight,
            actualWeight: newPos.actualWeight,
            lastUpdated: new Date()
          });
        } else {
          // Keep current position
          rebalancingPositions.push(currentPos);
        }
      }
    }
    
    return rebalancingPositions;
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

  private estimateCategoryVolatility(category: MarketCategory, profile: ExpenseProfile): Decimal {
    // Estimate volatility based on expense profile and historical data
    const categoryExpenses = profile.expenses.filter(
      e => EXPENSE_TO_MARKET_CATEGORY[e.category] === category
    );
    
    if (categoryExpenses.length === 0) return new Decimal(0.1); // Default 10%
    
    // Calculate volatility based on fixed vs variable ratio
    const variableExpenses = categoryExpenses.filter(e => !e.isFixed);
    const variableRatio = variableExpenses.length / categoryExpenses.length;
    
    // Base volatility by category
    const baseVolatilities: Record<MarketCategory, number> = {
      food: 0.15,
      housing: 0.05,
      energy: 0.25,
      healthcare: 0.10,
      transport: 0.20,
      tech: 0.12,
      materials: 0.18
    };
    
    const baseVol = baseVolatilities[category] || 0.15;
    
    // Adjust for user's expense variability
    return new Decimal(baseVol).mul(0.5 + variableRatio * 0.5);
  }

  private getCategoryCorrelation(cat1: MarketCategory, cat2: MarketCategory): Decimal {
    // Simplified correlation matrix between expense categories
    const correlations: Record<string, number> = {
      'food-housing': 0.3,
      'food-energy': 0.2,
      'food-transport': 0.4,
      'housing-energy': 0.5,
      'housing-transport': 0.1,
      'energy-transport': 0.6,
      'healthcare-food': 0.1,
      'healthcare-housing': 0.2,
      'tech-materials': 0.4,
    };
    
    const key1 = `${cat1}-${cat2}`;
    const key2 = `${cat2}-${cat1}`;
    
    return new Decimal(correlations[key1] || correlations[key2] || 0.1);
  }
}