import { z } from 'zod';
import Decimal from 'decimal.js';
import { MarketCategory, Region, DecimalSchema } from '@ghostsignals/core';

// Price observation from external source
export const PriceObservationSchema = z.object({
  id: z.string(),
  category: z.string(), // Hierarchical: "food.grains.wheat" 
  region: z.string(), // Specific region: "us.california.los-angeles"
  value: DecimalSchema,
  timestamp: z.date(),
  source: z.string(), // Data provider ID
  confidence: z.number().min(0).max(1).default(0.8),
  metadata: z.record(z.unknown()).optional(),
  unitOfMeasure: z.string().optional(), // "USD per lb", "USD per gallon", etc.
  raw: z.unknown().optional() // Original data for debugging
});

export type PriceObservation = z.infer<typeof PriceObservationSchema>;

// Aggregated price index point
export const PriceIndexPointSchema = z.object({
  category: z.string(),
  region: z.string(),
  value: DecimalSchema,
  timestamp: z.date(),
  confidence: DecimalSchema,
  observationCount: z.number(),
  method: z.enum(['median', 'mean', 'weighted_mean', 'weighted_average', 'geometric_mean']),
  volatility: DecimalSchema.optional(),
  outlierCount: z.number().default(0),
  embedding: z.array(z.number()).optional() // ghostvector embedding
});

export type PriceIndexPoint = z.infer<typeof PriceIndexPointSchema>;

// Historical price series
export const PriceSeriesSchema = z.object({
  category: z.string(),
  region: z.string(),
  timeframe: z.enum(['1h', '1d', '1w', '1m']),
  points: z.array(PriceIndexPointSchema),
  metadata: z.object({
    firstObservation: z.date(),
    lastObservation: z.date(),
    totalObservations: z.number(),
    avgConfidence: DecimalSchema,
    avgVolatility: DecimalSchema
  })
});

export type PriceSeries = z.infer<typeof PriceSeriesSchema>;

// Category taxonomy node
export const CategoryNodeSchema = z.object({
  id: z.string(), // "food.grains.wheat"
  name: z.string(), // "Wheat"
  parentId: z.string().optional(), // "food.grains"
  level: z.number(), // 0 = root, 1 = category, 2 = subcategory, etc.
  children: z.array(z.string()).default([]), // Child category IDs
  description: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  isLeaf: z.boolean(), // True if no children (actual price category)
  marketCategory: z.string().optional(), // Maps to MarketCategory enum
  weight: DecimalSchema.default(new Decimal(1)), // Weight in parent composite
  embedding: z.array(z.number()).optional() // Category embedding for similarity
});

export type CategoryNode = z.infer<typeof CategoryNodeSchema>;

// Oracle configuration
export const OracleConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  updateFrequency: z.enum(['1m', '5m', '15m', '1h', '1d']),
  categories: z.array(z.string()), // Categories this oracle provides
  regions: z.array(z.string()), // Regions covered
  reliability: z.number().min(0).max(1),
  isActive: z.boolean().default(true),
  lastUpdate: z.date().optional(),
  errorCount: z.number().default(0)
});

export type OracleConfig = z.infer<typeof OracleConfigSchema>;

// Composite price index (like CPI)
export const CompositeIndexSchema = z.object({
  id: z.string(),
  name: z.string(), // "Food Price Index", "Housing Cost Index"
  description: z.string(),
  baseDate: z.date(), // Index = 100 on this date
  baseValue: DecimalSchema.default(new Decimal(100)),
  components: z.array(z.object({
    categoryId: z.string(),
    weight: DecimalSchema,
    region: z.string().optional()
  })),
  value: DecimalSchema,
  lastUpdate: z.date(),
  historicalSeries: z.array(z.object({
    date: z.date(),
    value: DecimalSchema
  })).default([]),
  volatility: DecimalSchema.optional(),
  embedding: z.array(z.number()).optional()
});

export type CompositeIndex = z.infer<typeof CompositeIndexSchema>;

// Anomaly detection result
export const AnomalySchema = z.object({
  id: z.string(),
  category: z.string(),
  region: z.string(),
  timestamp: z.date(),
  severity: z.enum(['low', 'medium', 'high']),
  type: z.enum(['spike', 'drop', 'volatility', 'trend_break']),
  currentValue: DecimalSchema,
  expectedValue: DecimalSchema,
  deviation: DecimalSchema, // Standard deviations from expected
  confidence: DecimalSchema,
  description: z.string(),
  affectedMarkets: z.array(z.string()).default([])
});

export type Anomaly = z.infer<typeof AnomalySchema>;

// Data source metadata
export const DataSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['api', 'scraper', 'manual', 'fed', 'usda', 'bls']),
  url: z.string().optional(),
  description: z.string(),
  categories: z.array(z.string()),
  regions: z.array(z.string()),
  updateFrequency: z.string(),
  reliability: DecimalSchema,
  cost: DecimalSchema.optional(), // Cost per request/month
  rateLimit: z.object({
    requests: z.number(),
    window: z.string() // "1m", "1h", "1d"
  }).optional(),
  authentication: z.object({
    type: z.enum(['none', 'api_key', 'oauth', 'basic']),
    config: z.record(z.string())
  }).optional()
});

export type DataSource = z.infer<typeof DataSourceSchema>;

// Aggregation configuration
export const AggregationConfigSchema = z.object({
  category: z.string(),
  region: z.string(),
  method: z.enum(['median', 'mean', 'weighted_mean', 'geometric_mean']),
  outlierThreshold: z.number().min(0).max(10).default(2.5), // Standard deviations
  minObservations: z.number().min(1).default(3),
  maxAge: z.string().default('1h'), // Max age of observations to include
  weights: z.record(z.number()).optional(), // Source weights for weighted mean
  smoothing: z.object({
    enabled: z.boolean().default(false),
    method: z.enum(['ema', 'sma', 'kalman']),
    window: z.number().default(10)
  }).optional()
});

export type AggregationConfig = z.infer<typeof AggregationConfigSchema>;