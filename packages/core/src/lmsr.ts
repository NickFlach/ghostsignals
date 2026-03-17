import Decimal from 'decimal.js';
import { Outcome } from './schemas.js';

/**
 * Logarithmic Market Scoring Rule (LMSR) implementation
 * 
 * LMSR is an automated market maker that uses logarithmic scoring to provide
 * liquidity and price discovery for prediction markets.
 * 
 * Key formulas:
 * - Cost function: C(q) = b * ln(Σ exp(qᵢ/b))
 * - Price: P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
 * - Marginal cost: ∂C/∂qᵢ = exp(qᵢ/b) / Σ exp(qⱼ/b) = P(i)
 * 
 * Where:
 * - b = liquidity parameter (higher b = more liquidity, lower spreads)
 * - qᵢ = quantity of shares for outcome i
 * - C(q) = total cost to reach share allocation q
 */

export class LMSREngine {
  private liquidityParameter: Decimal;
  private spreadFee: Decimal;

  constructor(liquidityParameter: Decimal, spreadFee: Decimal = new Decimal('0.01')) {
    this.liquidityParameter = liquidityParameter;
    this.spreadFee = spreadFee; // fraction deducted from sell payouts to prevent arbitrage
  }

  /**
   * Calculate the cost function C(q) = b * ln(Σ exp(qᵢ/b))
   */
  private costFunction(shares: Decimal[]): Decimal {
    // Calculate Σ exp(qᵢ/b)
    const sumExp = shares.reduce((sum, qi) => {
      const expTerm = qi.div(this.liquidityParameter).exp();
      return sum.add(expTerm);
    }, new Decimal(0));

    // Return b * ln(sumExp)
    return this.liquidityParameter.mul(sumExp.ln());
  }

  /**
   * Calculate current prices for all outcomes
   * P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
   */
  calculatePrices(outcomes: Outcome[]): Decimal[] {
    const shares = outcomes.map(o => o.shares);
    
    // Calculate exp(qᵢ/b) for each outcome
    const expTerms = shares.map(qi => 
      qi.div(this.liquidityParameter).exp()
    );

    // Calculate denominator: Σ exp(qⱼ/b)
    const denominator = expTerms.reduce((sum, exp) => sum.add(exp), new Decimal(0));

    // Calculate prices: P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
    return expTerms.map(exp => exp.div(denominator));
  }

  /**
   * Calculate the cost to buy a specific quantity of shares
   * Cost = C(q + Δq) - C(q)
   */
  calculateBuyCost(
    outcomes: Outcome[],
    outcomeIndex: number,
    quantity: Decimal
  ): { cost: Decimal; newPrices: Decimal[] } {
    const currentShares = outcomes.map(o => o.shares);
    const newShares = [...currentShares];
    newShares[outcomeIndex] = currentShares[outcomeIndex].add(quantity);

    const currentCost = this.costFunction(currentShares);
    const newCost = this.costFunction(newShares);
    const cost = newCost.sub(currentCost);

    // Calculate new outcomes with updated shares
    const newOutcomes = outcomes.map((outcome, i) => ({
      ...outcome,
      shares: newShares[i]
    }));

    const newPrices = this.calculatePrices(newOutcomes);

    return { cost, newPrices };
  }

  /**
   * Calculate the payout from selling a specific quantity of shares
   * Payout = C(q) - C(q - Δq)
   */
  calculateSellPayout(
    outcomes: Outcome[],
    outcomeIndex: number,
    quantity: Decimal
  ): { payout: Decimal; newPrices: Decimal[] } {
    const currentShares = outcomes.map(o => o.shares);
    const newShares = [...currentShares];
    
    // Ensure we don't go negative
    const maxSell = currentShares[outcomeIndex];
    const actualQuantity = Decimal.min(quantity, maxSell);
    
    newShares[outcomeIndex] = currentShares[outcomeIndex].sub(actualQuantity);

    const currentCost = this.costFunction(currentShares);
    const newCost = this.costFunction(newShares);
    // Apply spread fee to prevent round-trip arbitrage
    const rawPayout = currentCost.sub(newCost);
    const payout = rawPayout.mul(new Decimal(1).sub(this.spreadFee));

    // Calculate new outcomes with updated shares
    const newOutcomes = outcomes.map((outcome, i) => ({
      ...outcome,
      shares: newShares[i]
    }));

    const newPrices = this.calculatePrices(newOutcomes);

    return { payout, newPrices };
  }

  /**
   * Calculate marginal price for a small trade
   * This is more efficient for price quotes without actually executing
   */
  getMarginalPrice(outcomes: Outcome[], outcomeIndex: number): Decimal {
    const shares = outcomes.map(o => o.shares);
    const expTerm = shares[outcomeIndex].div(this.liquidityParameter).exp();
    
    const denominator = shares.reduce((sum, qi) => {
      return sum.add(qi.div(this.liquidityParameter).exp());
    }, new Decimal(0));

    return expTerm.div(denominator);
  }

  /**
   * Calculate the liquidity (market depth) at current prices
   * Higher liquidity means smaller price impact for trades
   */
  calculateLiquidity(outcomes: Outcome[]): Decimal {
    return this.liquidityParameter;
  }

  /**
   * Calculate the spread between buy and sell prices for a given quantity
   */
  calculateSpread(
    outcomes: Outcome[],
    outcomeIndex: number,
    quantity: Decimal
  ): { buyPrice: Decimal; sellPrice: Decimal; spread: Decimal } {
    const { cost } = this.calculateBuyCost(outcomes, outcomeIndex, quantity);
    const buyPrice = cost.div(quantity);

    const { payout } = this.calculateSellPayout(outcomes, outcomeIndex, quantity);
    const sellPrice = payout.div(quantity);

    const spread = buyPrice.sub(sellPrice);

    return { buyPrice, sellPrice, spread };
  }

  /**
   * Validate that all probabilities sum to 1 (within tolerance)
   */
  validateProbabilities(outcomes: Outcome[], tolerance: Decimal = new Decimal('0.001')): boolean {
    // Validate the stored probability values (not computed prices)
    const sum = outcomes.reduce((acc, o) => acc.add(o.probability), new Decimal(0));
    return sum.sub(1).abs().lte(tolerance);
  }

  /**
   * Calculate the expected value of holding a position
   */
  calculateExpectedValue(
    outcomes: Outcome[],
    position: { outcomeIndex: number; shares: Decimal }[]
  ): Decimal {
    const prices = this.calculatePrices(outcomes);
    
    return position.reduce((expectedValue, pos) => {
      const outcomePrice = prices[pos.outcomeIndex];
      const positionValue = pos.shares.mul(outcomePrice);
      return expectedValue.add(positionValue);
    }, new Decimal(0));
  }

  /**
   * Simulate market resolution and calculate payouts
   * In a resolved market, the winning outcome pays 1 per share, others pay 0
   */
  resolveMarket(
    outcomes: Outcome[],
    winningOutcomeIndex: number,
    userPositions: Map<string, { outcomeIndex: number; shares: Decimal }[]>
  ): Map<string, Decimal> {
    const payouts = new Map<string, Decimal>();

    for (const [userId, positions] of userPositions) {
      let totalPayout = new Decimal(0);

      for (const position of positions) {
        if (position.outcomeIndex === winningOutcomeIndex) {
          // Winning shares pay 1 per share
          totalPayout = totalPayout.add(position.shares);
        }
        // Losing shares pay 0 (no need to add anything)
      }

      payouts.set(userId, totalPayout);
    }

    return payouts;
  }
}