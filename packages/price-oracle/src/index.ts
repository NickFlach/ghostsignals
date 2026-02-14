// Main price oracle exports
export { PriceOracle } from './price-oracle.js';
export { CategoryTaxonomy } from './category-taxonomy.js';

// Schema exports
export * from './schemas.js';

// Type exports
export type {
  PriceObservation,
  PriceIndexPoint,
  PriceSeries,
  CompositeIndex,
  Anomaly,
  CategoryNode,
  DataSource,
  OracleConfig,
  AggregationConfig
} from './schemas.js';

// Interface exports from price oracle
export type {
  PriceAggregationResult,
  AnomalyDetectionConfig
} from './price-oracle.js';