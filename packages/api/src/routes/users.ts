import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { AppContext, UserProfile } from '../context.js';

const CreateUserSchema = z.object({
  username: z.string().min(1).max(50),
  email: z.string().email(),
  settings: z.object({
    riskTolerance: z.number().min(0).max(1).default(0.5),
    hedgingBudget: z.number().positive().default(500),
    autoRebalance: z.boolean().default(true),
    rebalanceThreshold: z.number().min(0).max(1).default(0.05),
  }).optional(),
});

const UpdateSettingsSchema = z.object({
  riskTolerance: z.number().min(0).max(1).optional(),
  hedgingBudget: z.number().positive().optional(),
  autoRebalance: z.boolean().optional(),
  rebalanceThreshold: z.number().min(0).max(1).optional(),
});

export function createUserRoutes(ctx: AppContext) {
  const app = new Hono();

  // Create user
  app.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { data } = parsed;
    const user: UserProfile = {
      id: randomUUID(),
      username: data.username,
      email: data.email,
      createdAt: new Date(),
      settings: data.settings ?? {
        riskTolerance: 0.5,
        hedgingBudget: 500,
        autoRebalance: true,
        rebalanceThreshold: 0.05,
      },
    };

    ctx.users.set(user.id, user);
    return c.json(user, 201);
  });

  // Get user
  app.get('/:id', (c) => {
    const user = ctx.users.get(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json(user);
  });

  // Update user settings
  app.patch('/:id/settings', async (c) => {
    const user = ctx.users.get(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);

    const body = await c.req.json();
    const parsed = UpdateSettingsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    user.settings = { ...user.settings, ...parsed.data };
    ctx.users.set(user.id, user);

    return c.json(user);
  });

  // List users
  app.get('/', (c) => {
    const users = Array.from(ctx.users.values());
    return c.json({ users, total: users.length });
  });

  return app;
}
