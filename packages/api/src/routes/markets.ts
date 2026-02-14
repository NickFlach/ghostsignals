import { Hono } from 'hono';
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';

const CreateMarketSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['food', 'housing', 'energy', 'healthcare', 'transport', 'tech', 'materials']),
  region: z.string(),
  type: z.enum(['price_index', 'conditional', 'binary']),
  outcomes: z.array(z.object({ name: z.string(), description: z.string().optional() })).min(2).max(10),
  initialLiquidity: z.number().positive(),
  liquidityParameter: z.number().positive(),
  resolutionDate: z.string().datetime().optional(),
});

export function createMarketRoutes(ctx: AppContext) {
  const app = new Hono();

  // List all markets
  app.get('/', (c) => {
    const markets = ctx.marketEngine.getActiveMarkets();
    return c.json({
      markets: markets.map(m => ({
        ...m,
        liquidity: m.liquidity.toString(),
        liquidityParameter: m.liquidityParameter.toString(),
        outcomes: m.outcomes.map(o => ({
          ...o,
          probability: o.probability.toString(),
          shares: o.shares.toString(),
        })),
      })),
      total: markets.length,
    });
  });

  // Get single market
  app.get('/:id', (c) => {
    const market = ctx.marketEngine.getMarket(c.req.param('id'));
    if (!market) return c.json({ error: 'Market not found' }, 404);

    return c.json({
      ...market,
      liquidity: market.liquidity.toString(),
      liquidityParameter: market.liquidityParameter.toString(),
      outcomes: market.outcomes.map(o => ({
        ...o,
        probability: o.probability.toString(),
        shares: o.shares.toString(),
      })),
    });
  });

  // Create market
  app.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateMarketSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data } = parsed;
    const market = ctx.marketEngine.createMarket({
      title: data.title,
      description: data.description,
      category: data.category as any,
      region: data.region as any,
      type: data.type as any,
      outcomes: data.outcomes,
      initialLiquidity: new Decimal(data.initialLiquidity),
      liquidityParameter: new Decimal(data.liquidityParameter),
      resolutionDate: data.resolutionDate ? new Date(data.resolutionDate) : undefined,
    });

    return c.json({ id: market.id, title: market.title }, 201);
  });

  // Get market quote
  app.get('/:id/quote', (c) => {
    const marketId = c.req.param('id');
    const outcomeId = c.req.query('outcomeId');
    const quantity = c.req.query('quantity') || '100';
    const type = (c.req.query('type') || 'buy') as 'buy' | 'sell';

    if (!outcomeId) return c.json({ error: 'outcomeId required' }, 400);

    const quote = ctx.marketEngine.getQuote(marketId, outcomeId, new Decimal(quantity), type);
    if (!quote) return c.json({ error: 'Quote unavailable' }, 404);

    return c.json({
      outcomeId: quote.outcomeId,
      ammBuyPrice: quote.ammBuyPrice.toString(),
      ammSellPrice: quote.ammSellPrice.toString(),
      liquidity: quote.liquidity.toString(),
      spread: quote.spread.toString(),
    });
  });

  // Resolve market
  app.post('/:id/resolve', async (c) => {
    const marketId = c.req.param('id');
    const { winningOutcomeId } = await c.req.json();

    try {
      const payouts = ctx.marketEngine.resolveMarket(marketId, winningOutcomeId);
      const payoutEntries = Array.from(payouts.entries()).map(([userId, amount]) => ({
        userId,
        amount: amount.toString(),
      }));
      return c.json({ resolved: true, payouts: payoutEntries });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  return app;
}
