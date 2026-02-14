import Decimal from 'decimal.js';
import {
  PriceObservation,
  PriceIndexPoint,
  PriceSeries,
  CompositeIndex,
  Anomaly,
  AggregationConfig,
  OracleConfig,
  DataSource
} from './schemas.js';
import { CategoryTaxonomy } from './category-taxonomy.js';

/**
 * Price Oracle - Core price feed aggregation and indexing system
 * 
 * This component:
 * - Aggregates price observations from multiple sources
 * - Applies outlier filtering and robust aggregation
 * - Detects price anomalies
 * - Maintains historical price series with ghostvector integration
 * - Constructs composite price indices
 */

export interface PriceAggregationResult {
  indexPoint: PriceIndexPoint;
  includedObservations: PriceObservation[];
  excludedObservations: PriceObservation[];
  outlierCount: number;
  confidence: Decimal;
}

export interface AnomalyDetectionConfig {
  lookbackPeriods: number;
  sensitivityThreshold: number; // Standard deviations
  minObservationsRequired: number;
  enableTrendAnalysis: boolean;
  enableVolatilityAnalysis: boolean;
}

export class PriceOracle {
  private observations = new Map<string, PriceObservation[]>(); // category+region -> observations
  private priceHistory = new Map<string, PriceIndexPoint[]>(); // category+region -> historical points
  private compositeIndices = new Map<string, CompositeIndex>();
  private dataSources = new Map<string, DataSource>();
  private aggregationConfigs = new Map<string, AggregationConfig>();

  constructor(
    private taxonomy: CategoryTaxonomy,
    private ghostvectorClient?: any // Would be ghostvector client for embeddings
  ) {}

  /**
   * Submit price observations from external sources
   */
  submitObservations(observations: PriceObservation[]): void {
    for (const observation of observations) {
      this.validateObservation(observation);
      
      const key = this.getStorageKey(observation.category, observation.region);
      
      if (!this.observations.has(key)) {
        this.observations.set(key, []);
      }
      
      this.observations.get(key)!.push(observation);
      
      // Clean old observations
      this.cleanOldObservations(key);
    }
  }

  /**
   * Get current price for a category and region
   */
  getCurrentPrice(category: string, region: string): PriceIndexPoint | null {
    const key = this.getStorageKey(category, region);
    
    // Try to get from recent aggregation first
    const history = this.priceHistory.get(key);
    if (history && history.length > 0) {
      const latest = history[history.length - 1];
      const ageMs = Date.now() - latest.timestamp.getTime();
      
      // Return if less than 1 hour old
      if (ageMs < 60 * 60 * 1000) {
        return latest;
      }
    }

    // Aggregate current observations
    const observations = this.observations.get(key) || [];
    if (observations.length === 0) return null;

    const config = this.getAggregationConfig(category, region);
    const result = this.aggregateObservations(observations, config);

    // Store the result
    this.storeIndexPoint(result.indexPoint);

    return result.indexPoint;
  }

  /**
   * Get historical price series
   */
  getPriceSeries(
    category: string,
    region: string,
    timeframe: '1h' | '1d' | '1w' | '1m',
    limit: number = 100
  ): PriceSeries | null {
    const key = this.getStorageKey(category, region);
    const history = this.priceHistory.get(key);
    
    if (!history || history.length === 0) return null;

    // Filter and aggregate by timeframe
    const aggregatedPoints = this.aggregateByTimeframe(history, timeframe);
    const limitedPoints = aggregatedPoints.slice(-limit);

    if (limitedPoints.length === 0) return null;

    return {
      category,
      region,
      timeframe,
      points: limitedPoints,
      metadata: {
        firstObservation: limitedPoints[0].timestamp,
        lastObservation: limitedPoints[limitedPoints.length - 1].timestamp,
        totalObservations: limitedPoints.length,
        avgConfidence: this.calculateAverageConfidence(limitedPoints),
        avgVolatility: this.calculateAverageVolatility(limitedPoints)
      }
    };
  }

  /**
   * Detect price anomalies
   */
  detectAnomalies(
    category: string,
    region: string,
    config: AnomalyDetectionConfig
  ): Anomaly[] {
    const series = this.getPriceSeries(category, region, '1d', config.lookbackPeriods);
    if (!series || series.points.length < config.minObservationsRequired) {
      return [];
    }

    const anomalies: Anomaly[] = [];
    const latest = series.points[series.points.length - 1];
    const historical = series.points.slice(0, -1);

    // Calculate statistical baseline
    const values = historical.map(p => p.value);
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values, mean);

    // Detect price spikes/drops
    const currentValue = latest.value;
    const zScore = currentValue.sub(mean).div(stdDev);

    if (zScore.abs().gte(config.sensitivityThreshold)) {
      const severity = this.determineSeverity(zScore.abs());
      const type = zScore.gt(0) ? 'spike' : 'drop';

      anomalies.push({
        id: `${category}_${region}_${Date.now()}`,
        category,
        region,
        timestamp: latest.timestamp,
        severity,
        type,
        currentValue,
        expectedValue: mean,
        deviation: zScore.abs(),
        confidence: latest.confidence,
        description: `Price ${type} detected: ${currentValue} vs expected ${mean.toFixed(2)}`,
        affectedMarkets: this.findAffectedMarkets(category, region)
      });
    }

    // Detect volatility anomalies
    if (config.enableVolatilityAnalysis) {
      const volatilityAnomalies = this.detectVolatilityAnomalies(
        series.points,
        config.sensitivityThreshold
      );
      anomalies.push(...volatilityAnomalies);
    }

    // Detect trend breaks
    if (config.enableTrendAnalysis) {
      const trendAnomalies = this.detectTrendBreaks(
        series.points,
        config.sensitivityThreshold
      );
      anomalies.push(...trendAnomalies);
    }

    return anomalies;
  }

  /**
   * Create or update composite price index
   */
  createCompositeIndex(
    id: string,
    name: string,
    description: string,
    components: Array<{ categoryId: string; weight: Decimal; region?: string }>,
    baseDate: Date = new Date()
  ): CompositeIndex {
    // Calculate current index value
    let totalWeight = new Decimal(0);
    let weightedSum = new Decimal(0);

    for (const component of components) {
      const region = component.region || 'global';
      const price = this.getCurrentPrice(component.categoryId, region);
      
      if (price) {
        totalWeight = totalWeight.add(component.weight);
        weightedSum = weightedSum.add(price.value.mul(component.weight));
      }
    }

    const currentValue = totalWeight.gt(0) ? weightedSum.div(totalWeight) : new Decimal(100);

    const index: CompositeIndex = {
      id,
      name,
      description,
      baseDate,
      baseValue: new Decimal(100),
      components,
      value: currentValue,
      lastUpdate: new Date(),
      historicalSeries: [],
      volatility: this.calculateCompositeVolatility(components)
    };

    // Generate embedding for similarity analysis
    if (this.ghostvectorClient) {
      index.embedding = this.generateIndexEmbedding(index);
    }

    this.compositeIndices.set(id, index);
    return index;
  }

  /**
   * Update composite index values
   */
  updateCompositeIndex(indexId: string): CompositeIndex | null {
    const index = this.compositeIndices.get(indexId);
    if (!index) return null;

    // Calculate new value
    let totalWeight = new Decimal(0);
    let weightedSum = new Decimal(0);

    for (const component of index.components) {
      const region = component.region || 'global';
      const price = this.getCurrentPrice(component.categoryId, region);
      
      if (price) {
        totalWeight = totalWeight.add(component.weight);
        weightedSum = weightedSum.add(price.value.mul(component.weight));
      }
    }

    if (totalWeight.gt(0)) {
      const oldValue = index.value;
      const newValue = weightedSum.div(totalWeight);

      // Store historical point
      index.historicalSeries.push({
        date: new Date(),
        value: newValue
      });

      // Keep only last 1000 points
      if (index.historicalSeries.length > 1000) {
        index.historicalSeries = index.historicalSeries.slice(-1000);
      }

      // Update index
      index.value = newValue;
      index.lastUpdate = new Date();
      index.volatility = this.calculateCompositeVolatility(index.components);

      // Update embedding
      if (this.ghostvectorClient) {
        index.embedding = this.generateIndexEmbedding(index);
      }

      this.compositeIndices.set(indexId, index);
    }

    return index;
  }

  /**
   * Get all composite indices
   */
  getCompositeIndices(): CompositeIndex[] {
    return Array.from(this.compositeIndices.values());
  }

  /**
   * Register a data source
   */
  registerDataSource(source: DataSource): void {
    this.dataSources.set(source.id, source);
  }

  /**
   * Configure aggregation for a category/region
   */
  setAggregationConfig(category: string, region: string, config: AggregationConfig): void {
    const key = this.getStorageKey(category, region);
    this.aggregationConfigs.set(key, config);
  }

  private validateObservation(observation: PriceObservation): void {
    // Validate category exists in taxonomy
    const categoryNode = this.taxonomy.getCategory(observation.category);
    if (!categoryNode) {
      throw new Error(`Unknown category: ${observation.category}`);
    }

    // Validate leaf category
    if (!categoryNode.isLeaf) {
      throw new Error(`Category ${observation.category} is not a leaf node`);
    }

    // Validate price value
    if (observation.value.lte(0)) {
      throw new Error('Price value must be positive');
    }

    // Validate timestamp
    const now = new Date();
    if (observation.timestamp > now) {
      throw new Error('Observation timestamp cannot be in the future');
    }

    // Validate age (no older than 7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (now.getTime() - observation.timestamp.getTime() > maxAge) {
      throw new Error('Observation is too old (max 7 days)');
    }
  }

  private aggregateObservations(
    observations: PriceObservation[],
    config: AggregationConfig
  ): PriceAggregationResult {
    // Filter by age
    const cutoff = new Date(Date.now() - this.parseTimeToMs(config.maxAge));
    const recentObservations = observations.filter(obs => obs.timestamp >= cutoff);

    if (recentObservations.length < config.minObservations) {
      throw new Error('Insufficient recent observations for aggregation');
    }

    // Detect and exclude outliers
    const { included, excluded } = this.filterOutliers(recentObservations, config.outlierThreshold);

    if (included.length < config.minObservations) {
      throw new Error('Insufficient observations after outlier filtering');
    }

    // Calculate aggregated price
    let aggregatedValue: Decimal;
    let confidence: Decimal;

    switch (config.method) {
      case 'median':
        aggregatedValue = this.calculateMedian(included.map(obs => obs.value));
        confidence = this.calculateMedianConfidence(included);
        break;
        
      case 'mean':
        aggregatedValue = this.calculateMean(included.map(obs => obs.value));
        confidence = this.calculateMeanConfidence(included);
        break;
        
      case 'weighted_mean':
        const result = this.calculateWeightedMean(included, config.weights || {});
        aggregatedValue = result.value;
        confidence = result.confidence;
        break;
        
      case 'geometric_mean':
        aggregatedValue = this.calculateGeometricMean(included.map(obs => obs.value));
        confidence = this.calculateGeometricMeanConfidence(included);
        break;
        
      default:
        throw new Error(`Unknown aggregation method: ${config.method}`);
    }

    const indexPoint: PriceIndexPoint = {
      category: config.category,
      region: config.region,
      value: aggregatedValue,
      timestamp: new Date(),
      confidence,
      observationCount: included.length,
      method: config.method,
      outlierCount: excluded.length
    };

    // Generate embedding if ghostvector is available
    if (this.ghostvectorClient) {
      indexPoint.embedding = this.generatePriceEmbedding(indexPoint, included);
    }

    return {
      indexPoint,
      includedObservations: included,
      excludedObservations: excluded,
      outlierCount: excluded.length,
      confidence
    };
  }

  private filterOutliers(
    observations: PriceObservation[],
    threshold: number
  ): { included: PriceObservation[]; excluded: PriceObservation[] } {
    if (observations.length <= 2) {
      return { included: observations, excluded: [] };
    }

    const values = observations.map(obs => obs.value);
    const median = this.calculateMedian(values);
    const mad = this.calculateMAD(values, median);

    const included: PriceObservation[] = [];
    const excluded: PriceObservation[] = [];

    for (const observation of observations) {
      const deviation = observation.value.sub(median).abs().div(mad.add(1e-10));
      
      if (deviation.lte(threshold)) {
        included.push(observation);
      } else {
        excluded.push(observation);
      }
    }

    return { included, excluded };
  }

  private calculateMedian(values: Decimal[]): Decimal {
    const sorted = [...values].sort((a, b) => a.sub(b).toNumber());
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return sorted[mid - 1].add(sorted[mid]).div(2);
    } else {
      return sorted[mid];
    }
  }

  private calculateMean(values: Decimal[]): Decimal {
    const sum = values.reduce((acc, val) => acc.add(val), new Decimal(0));
    return sum.div(values.length);
  }

  private calculateMAD(values: Decimal[], median: Decimal): Decimal {
    const deviations = values.map(val => val.sub(median).abs());
    return this.calculateMedian(deviations);
  }

  private calculateStdDev(values: Decimal[], mean: Decimal): Decimal {
    const sumSquaredDiffs = values.reduce((acc, val) => {
      const diff = val.sub(mean);
      return acc.add(diff.pow(2));
    }, new Decimal(0));
    
    const variance = sumSquaredDiffs.div(values.length - 1);
    return variance.sqrt();
  }

  private getStorageKey(category: string, region: string): string {
    return `${category}:${region}`;
  }

  private getAggregationConfig(category: string, region: string): AggregationConfig {
    const key = this.getStorageKey(category, region);
    
    return this.aggregationConfigs.get(key) || {
      category,
      region,
      method: 'median',
      outlierThreshold: 2.5,
      minObservations: 3,
      maxAge: '1h'
    };
  }

  private cleanOldObservations(key: string): void {
    const observations = this.observations.get(key);
    if (!observations) return;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const filtered = observations.filter(obs => obs.timestamp >= cutoff);
    
    if (filtered.length !== observations.length) {
      this.observations.set(key, filtered);
    }
  }

  private storeIndexPoint(point: PriceIndexPoint): void {
    const key = this.getStorageKey(point.category, point.region);
    
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    
    const history = this.priceHistory.get(key)!;
    history.push(point);
    
    // Keep only last 10000 points
    if (history.length > 10000) {
      this.priceHistory.set(key, history.slice(-10000));
    }

    // Store in ghostvector if available
    if (this.ghostvectorClient && point.embedding) {
      this.storeInGhostvector(point);
    }
  }

  private parseTimeToMs(timeStr: string): number {
    const match = timeStr.match(/^(\d+)([mhd])$/);
    if (!match) return 60 * 60 * 1000; // Default 1 hour

    const [, num, unit] = match;
    const value = parseInt(num);

    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  // Placeholder implementations for complex calculations
  private calculateWeightedMean(observations: PriceObservation[], weights: Record<string, number>) {
    // Simplified implementation
    const mean = this.calculateMean(observations.map(obs => obs.value));
    return { value: mean, confidence: new Decimal(0.8) };
  }

  private calculateGeometricMean(values: Decimal[]): Decimal {
    const product = values.reduce((acc, val) => acc.mul(val), new Decimal(1));
    return product.pow(new Decimal(1).div(values.length));
  }

  private calculateMedianConfidence(observations: PriceObservation[]): Decimal {
    const avgConfidence = observations.reduce((sum, obs) => sum.add(obs.confidence), new Decimal(0))
      .div(observations.length);
    return avgConfidence;
  }

  private calculateMeanConfidence(observations: PriceObservation[]): Decimal {
    return this.calculateMedianConfidence(observations);
  }

  private calculateGeometricMeanConfidence(observations: PriceObservation[]): Decimal {
    return this.calculateMedianConfidence(observations);
  }

  private aggregateByTimeframe(points: PriceIndexPoint[], timeframe: string): PriceIndexPoint[] {
    // Simplified aggregation - would implement proper time bucketing
    return points;
  }

  private calculateAverageConfidence(points: PriceIndexPoint[]): Decimal {
    const sum = points.reduce((acc, p) => acc.add(p.confidence), new Decimal(0));
    return sum.div(points.length);
  }

  private calculateAverageVolatility(points: PriceIndexPoint[]): Decimal {
    if (points.length < 2) return new Decimal(0);
    
    const values = points.map(p => p.value);
    const mean = this.calculateMean(values);
    return this.calculateStdDev(values, mean);
  }

  private determineSeverity(zScore: Decimal): 'low' | 'medium' | 'high' {
    if (zScore.gte(4)) return 'high';
    if (zScore.gte(2.5)) return 'medium';
    return 'low';
  }

  private findAffectedMarkets(category: string, region: string): string[] {
    // Find related markets that might be affected
    const categoryNode = this.taxonomy.getCategory(category);
    if (!categoryNode) return [];

    const related = this.taxonomy.getSimilarCategories(category, 2);
    return related.map(node => node.id);
  }

  private detectVolatilityAnomalies(points: PriceIndexPoint[], threshold: number): Anomaly[] {
    // Simplified volatility anomaly detection
    return [];
  }

  private detectTrendBreaks(points: PriceIndexPoint[], threshold: number): Anomaly[] {
    // Simplified trend break detection
    return [];
  }

  private calculateCompositeVolatility(components: Array<{ categoryId: string; weight: Decimal }>): Decimal {
    // Simplified composite volatility calculation
    return new Decimal(0.1);
  }

  private generateIndexEmbedding(index: CompositeIndex): number[] {
    // Generate embedding for composite index using ghostvector
    return [];
  }

  private generatePriceEmbedding(point: PriceIndexPoint, observations: PriceObservation[]): number[] {
    // Generate embedding for price point using ghostvector
    return [];
  }

  private storeInGhostvector(point: PriceIndexPoint): void {
    // Store price point in ghostvector for historical analysis
  }
}