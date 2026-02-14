import { Hono } from 'hono';
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';

const TradeRequestSchema = z.object({
  userId: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  type: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  useAMM: z.boolean().default(true),
});

export function createTradingRoutes(ctx: AppContext) {
  const app = new Hono();

  // Execute trade
  app.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = TradeRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data } = parsed;

    try {
      const result = ctx.marketEngine.executeTrade({
        userId: data.userId,
        marketId: data.marketId,
        outcomeId: data.outcomeId,
        type: data.type,
        quantity: new Decimal(data.quantity),
        price: data.price ? new Decimal(data.price) : undefined,
        useAMM: data.useAMM,
      });

      return c.json({
        trades: result.trades.map(t => ({
          id: t.id,
          marketId: t.marketId,
          outcomeId: t.outcomeId,
          buyerId: t.buyerId,
          sellerId: t.sellerId,
          quantity: t.quantity.toString(),
          price: t.price.toString(),
          timestamp: t.timestamp.toISOString(),
        })),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // Get user positions
  app.get('/positions/:userId', (c) => {
    const userId = c.req.param('userId');
    const positions = ctx.marketEngine.getUserPositions(userId);

    return c.json({
      positions: positions.map(p => ({
        marketId: p.marketId,
        outcomeId: p.outcomeId,
        shares: p.shares.toString(),
        avgPrice: p.avgPrice.toString(),
        unrealizedPnl: p.unrealizedPnl.toString(),
        realizedPnl: p.realizedPnl.toString(),
      })),
    });
  });

  // Get user PnL
  app.get('/pnl/:userId', (c) => {
    const userId = c.req.param('userId');
    const pnl = ctx.marketEngine.calculateUserPnL(userId);

    return c.json({
      unrealized: pnl.unrealized.toString(),
      realized: pnl.realized.toString(),
    });
  });

  return app;
}
