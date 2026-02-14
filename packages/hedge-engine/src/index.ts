// Main hedge engine exports
export { HedgeEngine } from './hedge-engine.js';
export { ExpenseProfiler } from './expense-profiler.js';
export { PortfolioOptimizer } from './portfolio-optimizer.js';

// Schema exports
export * from './schemas.js';

// Type exports for convenience
export type {
  ExpenseProfile,
  ExpenseItem,
  ExpenseCategory,
  ExpenseFrequency,
  HedgingBasket,
  HedgingPosition,
  OptimizationConstraints,
  OptimizationResult,
  RebalanceRecommendation,
  PerformanceMetrics
} from './schemas.js';

// Interface exports
export type {
  ImportedTransaction,
  ExpenseAnalysis
} from './expense-profiler.js';

export type {
  MarketData,
  ExpenseCovarianceMatrix
} from './portfolio-optimizer.js';

export type {
  HedgeEngineConfig,
  BasketPerformance
} from './hedge-engine.js';