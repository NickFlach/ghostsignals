import { z } from 'zod';
import Decimal from 'decimal.js';

// Custom Decimal schema for precise financial math
export const DecimalSchema = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((val) => new Decimal(val));

// Market categories with regional variants
export const MarketCategorySchema = z.enum([
  'food',
  'housing', 
  'energy',
  'healthcare',
  'transport',
  'tech',
  'materials'
]);

export type MarketCategory = z.infer<typeof MarketCategorySchema>;

// Regional variants for market indices
export const RegionSchema = z.enum([
  'us-northeast',
  'us-southeast', 
  'us-midwest',
  'us-west',
  'us-southwest',
  'eu-north',
  'eu-south',
  'eu-central',
  'asia-east',
  'asia-southeast',
  'global'
]);

export type Region = z.infer<typeof RegionSchema>;

// Market types
export const MarketTypeSchema = z.enum([
  'price_index',
  'conditional',
  'binary'
]);

export type MarketType = z.infer<typeof MarketTypeSchema>;

// Market outcomes
export const OutcomeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  probability: DecimalSchema,
  shares: DecimalSchema
});

export type Outcome = z.infer<typeof OutcomeSchema>;

// Market state
export const MarketStateSchema = z.enum([
  'created',
  'active', 
  'paused',
  'resolved',
  'cancelled'
]);

export type MarketState = z.infer<typeof MarketStateSchema>;

// Core Market schema
export const MarketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: MarketCategorySchema,
  region: RegionSchema,
  type: MarketTypeSchema,
  state: MarketStateSchema,
  outcomes: z.array(OutcomeSchema),
  liquidity: DecimalSchema,
  liquidityParameter: DecimalSchema, // 'b' parameter for LMSR
  createdAt: z.date(),
  resolutionDate: z.date().optional(),
  resolvedOutcome: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type Market = z.infer<typeof MarketSchema>;

// Order types for the order book
export const OrderTypeSchema = z.enum(['buy', 'sell']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderStatusSchema = z.enum(['pending', 'filled', 'partial', 'cancelled']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  userId: z.string(),
  type: OrderTypeSchema,
  quantity: DecimalSchema,
  price: DecimalSchema,
  status: OrderStatusSchema,
  filledQuantity: DecimalSchema.default(new Decimal(0)),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type Order = z.infer<typeof OrderSchema>;

// Trade execution
export const TradeSchema = z.object({
  id: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  quantity: DecimalSchema,
  price: DecimalSchema,
  timestamp: z.date()
});

export type Trade = z.infer<typeof TradeSchema>;

// Position tracking
export const PositionSchema = z.object({
  userId: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  shares: DecimalSchema,
  avgPrice: DecimalSchema,
  unrealizedPnl: DecimalSchema,
  realizedPnl: DecimalSchema
});

export type Position = z.infer<typeof PositionSchema>;

// Price index data point
export const PricePointSchema = z.object({
  category: MarketCategorySchema,
  region: RegionSchema,
  subcategory: z.string().optional(),
  value: DecimalSchema,
  timestamp: z.date(),
  source: z.string(),
  confidence: DecimalSchema.optional()
});

export type PricePoint = z.infer<typeof PricePointSchema>;

// Market creation parameters
export const CreateMarketParamsSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: MarketCategorySchema,
  region: RegionSchema,
  type: MarketTypeSchema,
  outcomes: z.array(z.object({
    name: z.string(),
    description: z.string().optional()
  })),
  initialLiquidity: DecimalSchema,
  liquidityParameter: DecimalSchema,
  resolutionDate: z.date().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type CreateMarketParams = z.infer<typeof CreateMarketParamsSchema>;