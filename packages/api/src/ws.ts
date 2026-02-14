import { WebSocketServer, WebSocket } from 'ws';
import type { AppContext } from './context.js';

interface WsClient {
  ws: WebSocket;
  subscriptions: Set<string>; // "category:region" keys
}

export function setupWebSocket(wss: WebSocketServer, ctx: AppContext) {
  const clients: Map<string, WsClient> = new Map();
  let clientIdCounter = 0;

  wss.on('connection', (ws) => {
    const clientId = `client_${++clientIdCounter}`;
    const client: WsClient = { ws, subscriptions: new Set() };
    clients.set(clientId, client);

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'subscribe': {
            const key = `${msg.category}:${msg.region || 'global'}`;
            client.subscriptions.add(key);
            ws.send(JSON.stringify({ type: 'subscribed', channel: key }));
            break;
          }
          case 'unsubscribe': {
            const key = `${msg.category}:${msg.region || 'global'}`;
            client.subscriptions.delete(key);
            ws.send(JSON.stringify({ type: 'unsubscribed', channel: key }));
            break;
          }
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });

  // Broadcast price updates every 5 seconds
  setInterval(() => {
    const channels = new Set<string>();
    for (const client of clients.values()) {
      for (const sub of client.subscriptions) {
        channels.add(sub);
      }
    }

    for (const channel of channels) {
      const [category, region] = channel.split(':');
      const price = ctx.priceOracle.getCurrentPrice(category, region);
      if (!price) continue;

      const update = JSON.stringify({
        type: 'price_update',
        channel,
        data: {
          category: price.category,
          region: price.region,
          value: price.value.toString(),
          confidence: price.confidence.toString(),
          timestamp: price.timestamp.toISOString(),
        },
      });

      for (const client of clients.values()) {
        if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(update);
        }
      }
    }
  }, 5000);

  console.log('📡 WebSocket server ready for real-time price updates');
}
