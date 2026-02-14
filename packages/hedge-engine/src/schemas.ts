import { z } from 'zod';
import Decimal from 'decimal.js';
import { MarketCategory, Region, DecimalSchema } from '@ghostsignals/core';

// Expense frequency patterns
export const ExpenseFrequencySchema = z.enum([
  'daily',
  'weekly', 
  'monthly',
  'quarterly',
  'annually',
  'one-time'
]);

export type ExpenseFrequency = z.infer<typeof ExpenseFrequencySchema>;

// Expense categories (more granular than market categories)
export const ExpenseCategorySchema = z.enum([
  // Food subcategories
  'groceries',
  'dining_out',
  'beverages',
  'specialty_food',
  
  // Housing subcategories
  'rent',
  'mortgage',
  'utilities',
  'home_insurance',
  'property_tax',
  'maintenance',
  
  // Transport subcategories
  'fuel',
  'vehicle_insurance',
  'public_transit',
  'vehicle_maintenance',
  'parking',
  
  // Healthcare subcategories
  'health_insurance',
  'medications',
  'dental',
  'vision',
  'mental_health',
  
  // Energy subcategories
  'electricity',
  'gas',
  'heating_oil',
  'renewable_energy',
  
  // Tech subcategories
  'internet',
  'mobile',
  'software_subscriptions',
  'devices',
  
  // Materials/goods
  'clothing',
  'household_goods',
  'personal_care',
  'other'
]);

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

// Individual expense item
export const ExpenseItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: ExpenseCategorySchema,
  amount: DecimalSchema,
  frequency: ExpenseFrequencySchema,
  region: z.string(), // More specific than Region enum (e.g., "california", "new-york-city")
  isFixed: z.boolean(), // Fixed vs variable expense
  seasonality: z.number().min(0).max(1).optional(), // 0-1 seasonal adjustment factor
  notes: z.string().optional()
});

export type ExpenseItem = z.infer<typeof ExpenseItemSchema>;

// User expense profile
export const ExpenseProfileSchema = z.object({
  userId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  expenses: z.array(ExpenseItemSchema),
  totalMonthlyExpenses: DecimalSchema,
  riskTolerance: z.number().min(0).max(1), // 0 = very conservative, 1 = very aggressive
  hedgingBudget: DecimalSchema, // Amount willing to spend on hedging per month
  rebalanceThreshold: z.number().min(0).max(1), // When to trigger rebalancing
  createdAt: z.date(),
  updatedAt: z.date()
});

export type ExpenseProfile = z.infer<typeof ExpenseProfileSchema>;

// Market category mapping for expenses
export const EXPENSE_TO_MARKET_CATEGORY: Record<ExpenseCategory, MarketCategory> = {
  groceries: 'food',
  dining_out: 'food',
  beverages: 'food',
  specialty_food: 'food',
  
  rent: 'housing',
  mortgage: 'housing',
  utilities: 'housing',
  home_insurance: 'housing',
  property_tax: 'housing',
  maintenance: 'housing',
  
  fuel: 'transport',
  vehicle_insurance: 'transport',
  public_transit: 'transport',
  vehicle_maintenance: 'transport',
  parking: 'transport',
  
  health_insurance: 'healthcare',
  medications: 'healthcare',
  dental: 'healthcare',
  vision: 'healthcare',
  mental_health: 'healthcare',
  
  electricity: 'energy',
  gas: 'energy',
  heating_oil: 'energy',
  renewable_energy: 'energy',
  
  internet: 'tech',
  mobile: 'tech',
  software_subscriptions: 'tech',
  devices: 'tech',
  
  clothing: 'materials',
  household_goods: 'materials',
  personal_care: 'materials',
  other: 'materials'
};

// Hedging position in a specific market
export const HedgingPositionSchema = z.object({
  marketId: z.string(),
  outcomeId: z.string(),
  marketCategory: z.string(), // MarketCategory
  region: z.string(),
  shares: DecimalSchema,
  costBasis: DecimalSchema, // Total cost paid for these shares
  targetWeight: DecimalSchema, // Target allocation (0-1)
  actualWeight: DecimalSchema, // Current allocation (0-1)
  hedgeRatio: DecimalSchema, // How much of expense exposure this hedges
  lastUpdated: z.date()
});

export type HedgingPosition = z.infer<typeof HedgingPositionSchema>;

// Complete hedging basket for a user
export const HedgingBasketSchema = z.object({
  userId: z.string(),
  profileId: z.string(),
  positions: z.array(HedgingPositionSchema),
  totalValue: DecimalSchema,
  totalCost: DecimalSchema,
  stabilityScore: DecimalSchema, // S = 1 - σ(hedged)/σ(unhedged)
  hedgingEffectiveness: DecimalSchema, // Correlation between basket and expenses
  lastRebalance: z.date(),
  nextRebalanceCheck: z.date(),
  rebalanceCount: z.number().default(0)
});

export type HedgingBasket = z.infer<typeof HedgingBasketSchema>;

// Portfolio optimization constraints
export const OptimizationConstraintsSchema = z.object({
  maxPositionsPerCategory: z.number().default(3),
  minPositionSize: DecimalSchema.default(new Decimal(10)),
  maxPositionSize: DecimalSchema.default(new Decimal(1000)),
  maxConcentration: z.number().min(0).max(1).default(0.3), // Max % in any one position
  targetVolatilityReduction: z.number().min(0).max(1).default(0.5), // Target vol reduction
  rebalanceCostThreshold: DecimalSchema.default(new Decimal(5)) // Min savings to justify rebalance
});

export type OptimizationConstraints = z.infer<typeof OptimizationConstraintsSchema>;

// Optimization result
export const OptimizationResultSchema = z.object({
  positions: z.array(HedgingPositionSchema),
  expectedReturn: DecimalSchema,
  expectedVolatility: DecimalSchema,
  hedgedVolatility: DecimalSchema,
  stabilityScore: DecimalSchema,
  totalCost: DecimalSchema,
  feasible: z.boolean(),
  optimizationMethod: z.string(),
  computeTimeMs: z.number()
});

export type OptimizationResult = z.infer<typeof OptimizationResultSchema>;

// Rebalancing recommendation
export const RebalanceRecommendationSchema = z.object({
  recommendRebalance: z.boolean(),
  reason: z.string(),
  currentStabilityScore: DecimalSchema,
  projectedStabilityScore: DecimalSchema,
  estimatedCost: DecimalSchema,
  urgency: z.enum(['low', 'medium', 'high']),
  suggestedActions: z.array(z.object({
    type: z.enum(['buy', 'sell', 'hold']),
    marketId: z.string(),
    outcomeId: z.string(),
    currentShares: DecimalSchema,
    targetShares: DecimalSchema,
    estimatedCost: DecimalSchema
  }))
});

export type RebalanceRecommendation = z.infer<typeof RebalanceRecommendationSchema>;

// Historical performance metrics
export const PerformanceMetricsSchema = z.object({
  period: z.string(), // '1d', '7d', '30d', '90d', '1y'
  totalReturn: DecimalSchema,
  volatility: DecimalSchema,
  sharpeRatio: DecimalSchema.optional(),
  maxDrawdown: DecimalSchema,
  hedgingEffectiveness: DecimalSchema,
  expenseVarianceReduction: DecimalSchema,
  winRate: DecimalSchema, // % of periods where hedging helped
  averageHedgeValue: DecimalSchema
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;