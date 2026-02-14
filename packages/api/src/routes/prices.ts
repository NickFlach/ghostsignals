import { Hono } from 'hono';
import Decimal from 'decimal.js';
import type { AppContext } from '../context.js';

export function createPriceRoutes(ctx: AppContext) {
  const app = new Hono();

  // Get current price for category/region
  app.get('/current', (c) => {
    const category = c.req.query('category');
    const region = c.req.query('region') || 'global';

    if (!category) return c.json({ error: 'category required' }, 400);

    const price = ctx.priceOracle.getCurrentPrice(category, region);
    if (!price) return c.json({ error: 'No price data available' }, 404);

    return c.json({
      category: price.category,
      region: price.region,
      value: price.value.toString(),
      confidence: price.confidence.toString(),
      observationCount: price.observationCount,
      method: price.method,
      timestamp: price.timestamp.toISOString(),
    });
  });

  // Get price series
  app.get('/series', (c) => {
    const category = c.req.query('category');
    const region = c.req.query('region') || 'global';
    const timeframe = (c.req.query('timeframe') || '1d') as '1h' | '1d' | '1w' | '1m';
    const limit = parseInt(c.req.query('limit') || '100');

    if (!category) return c.json({ error: 'category required' }, 400);

    const series = ctx.priceOracle.getPriceSeries(category, region, timeframe, limit);
    if (!series) return c.json({ error: 'No series data' }, 404);

    return c.json({
      category: series.category,
      region: series.region,
      timeframe: series.timeframe,
      points: series.points.map(p => ({
        value: p.value.toString(),
        confidence: p.confidence.toString(),
        timestamp: p.timestamp.toISOString(),
      })),
      metadata: {
        totalObservations: series.metadata.totalObservations,
        avgConfidence: series.metadata.avgConfidence.toString(),
      },
    });
  });

  // Submit price observations
  app.post('/observations', async (c) => {
    const body = await c.req.json();
    const observations = Array.isArray(body) ? body : [body];

    try {
      const mapped = observations.map(obs => ({
        id: obs.id || `obs_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        category: obs.category,
        region: obs.region,
        value: new Decimal(obs.value),
        timestamp: new Date(obs.timestamp || Date.now()),
        source: obs.source || 'api',
        confidence: obs.confidence || 0.8,
        unitOfMeasure: obs.unitOfMeasure,
      }));

      ctx.priceOracle.submitObservations(mapped);
      return c.json({ accepted: mapped.length });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  });

  // Detect anomalies
  app.get('/anomalies', (c) => {
    const category = c.req.query('category');
    const region = c.req.query('region') || 'global';

    if (!category) return c.json({ error: 'category required' }, 400);

    const anomalies = ctx.priceOracle.detectAnomalies(category, region, {
      lookbackPeriods: 30,
      sensitivityThreshold: 2.5,
      minObservationsRequired: 10,
      enableTrendAnalysis: true,
      enableVolatilityAnalysis: true,
    });

    return c.json({
      anomalies: anomalies.map(a => ({
        id: a.id,
        severity: a.severity,
        type: a.type,
        currentValue: a.currentValue.toString(),
        expectedValue: a.expectedValue.toString(),
        deviation: a.deviation.toString(),
        description: a.description,
        timestamp: a.timestamp.toISOString(),
      })),
    });
  });

  // Get composite indices
  app.get('/indices', (c) => {
    const indices = ctx.priceOracle.getCompositeIndices();
    return c.json({
      indices: indices.map(idx => ({
        id: idx.id,
        name: idx.name,
        value: idx.value.toString(),
        lastUpdate: idx.lastUpdate.toISOString(),
      })),
    });
  });

  return app;
}
