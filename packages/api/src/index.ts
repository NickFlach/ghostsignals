import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import { createMarketRoutes } from './routes/markets.js';
import { createTradingRoutes } from './routes/trading.js';
import { createUserRoutes } from './routes/users.js';
import { createBasketRoutes } from './routes/baskets.js';
import { createPriceRoutes } from './routes/prices.js';
import { createAppContext, type AppContext } from './context.js';
import { setupWebSocket } from './ws.js';

const app = new Hono();
const ctx = createAppContext();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.route('/api/markets', createMarketRoutes(ctx));
app.route('/api/trading', createTradingRoutes(ctx));
app.route('/api/users', createUserRoutes(ctx));
app.route('/api/baskets', createBasketRoutes(ctx));
app.route('/api/prices', createPriceRoutes(ctx));

// Start server
const PORT = parseInt(process.env.PORT || '3001');

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🔮 ghostsignals API running on http://localhost:${info.port}`);
});

// WebSocket server for real-time price updates
const wss = new WebSocketServer({ server: server as any });
setupWebSocket(wss, ctx);

export { app, ctx };
export type { AppContext };
