import { Hono } from 'hono';
import { z } from 'zod';
import Decimal from 'decimal.js';
import type { AppContext } from '../context.js';

const CreateBasketSchema = z.object({
  userId: z.string(),
  transactions: z.array(z.object({
    date: z.string(),
    amount: z.number(),
    description: z.string(),
    category: z.string().optional(),
    merchant: z.string().optional(),
  })).optional(),
  riskTolerance: z.number().min(0).max(1).optional(),
  hedgingBudget: z.number().positive().optional(),
});

export function createBasketRoutes(ctx: AppContext) {
  const app = new Hono();

  // Create expense profile and generate basket
  app.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateBasketSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data } = parsed;

    try {
      // Create expense profile from transactions
      const transactions = (data.transactions || []).map(t => ({
        date: new Date(t.date),
        amount: t.amount,
        description: t.description,
        category: t.category,
        merchant: t.merchant,
      }));

      const profile = ctx.hedgeEngine.createExpenseProfile(
        data.userId,
        transactions,
        data.riskTolerance,
        data.hedgingBudget ? new Decimal(data.hedgingBudget) : undefined,
      );

      // Generate optimal basket
      const basket = await ctx.hedgeEngine.generateHedgingBasket(data.userId);

      return c.json({
        profileId: profile.userId,
        basket: {
          userId: basket.userId,
          positions: basket.positions.map(p => ({
            marketId: p.marketId,
            outcomeId: p.outcomeId,
            marketCategory: p.marketCategory,
            shares: p.shares.toString(),
            costBasis: p.costBasis.toString(),
            targetWeight: p.targetWeight.toString(),
            hedgeRatio: p.hedgeRatio.toString(),
          })),
          totalValue: basket.totalValue.toString(),
          stabilityScore: basket.stabilityScore.toString(),
          hedgingEffectiveness: basket.hedgingEffectiveness.toString(),
        },
      }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // Get user's basket
  app.get('/:userId', (c) => {
    const userId = c.req.param('userId');
    const basket = ctx.hedgeEngine.getHedgingBasket(userId);
    if (!basket) return c.json({ error: 'Basket not found' }, 404);

    return c.json({
      userId: basket.userId,
      positions: basket.positions.map(p => ({
        marketId: p.marketId,
        outcomeId: p.outcomeId,
        marketCategory: p.marketCategory,
        shares: p.shares.toString(),
        costBasis: p.costBasis.toString(),
        targetWeight: p.targetWeight.toString(),
        hedgeRatio: p.hedgeRatio.toString(),
      })),
      totalValue: basket.totalValue.toString(),
      stabilityScore: basket.stabilityScore.toString(),
      hedgingEffectiveness: basket.hedgingEffectiveness.toString(),
      lastRebalance: basket.lastRebalance.toISOString(),
      rebalanceCount: basket.rebalanceCount,
    });
  });

  // Check rebalance recommendation
  app.get('/:userId/rebalance', (c) => {
    const userId = c.req.param('userId');
    const recommendation = ctx.hedgeEngine.checkRebalanceNeeded(userId);

    return c.json({
      recommendRebalance: recommendation.recommendRebalance,
      reason: recommendation.reason,
      urgency: recommendation.urgency,
      currentStabilityScore: recommendation.currentStabilityScore.toString(),
      projectedStabilityScore: recommendation.projectedStabilityScore.toString(),
      estimatedCost: recommendation.estimatedCost.toString(),
    });
  });

  // Execute rebalance
  app.post('/:userId/rebalance', async (c) => {
    const userId = c.req.param('userId');

    try {
      const basket = await ctx.hedgeEngine.rebalanceBasket(userId);
      return c.json({
        rebalanced: true,
        stabilityScore: basket.stabilityScore.toString(),
        rebalanceCount: basket.rebalanceCount,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // Get basket performance
  app.get('/:userId/performance', (c) => {
    const userId = c.req.param('userId');
    const performance = ctx.hedgeEngine.getBasketPerformance(userId);
    if (!performance) return c.json({ error: 'No performance data' }, 404);

    return c.json({
      totalReturn: performance.totalReturn.toString(),
      hedgingEffectiveness: performance.hedgingEffectiveness.toString(),
      stabilityScore: performance.stabilityScore.toString(),
      expenseVarianceReduction: performance.expenseVarianceReduction.toString(),
      lastUpdated: performance.lastUpdated.toISOString(),
    });
  });

  // Simulate basket performance
  app.get('/:userId/simulate', (c) => {
    const userId = c.req.param('userId');
    const days = parseInt(c.req.query('days') || '30');
    const scenarios = parseInt(c.req.query('scenarios') || '1000');

    try {
      const sim = ctx.hedgeEngine.simulateBasketPerformance(userId, days, scenarios);
      return c.json({
        expectedStabilityScore: sim.expectedStabilityScore.toString(),
        stabilityScoreRange: sim.stabilityScoreRange.map(d => d.toString()),
        expectedVarianceReduction: sim.expectedVarianceReduction.toString(),
        winRate: sim.winRate.toString(),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  return app;
}
