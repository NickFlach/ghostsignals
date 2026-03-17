import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { PriceOracle } from '../price-oracle.js';
import { CategoryTaxonomy } from '../category-taxonomy.js';
import type { PriceObservation, AggregationConfig } from '../schemas.js';

describe('PriceOracle', () => {
  let oracle: PriceOracle;
  let taxonomy: CategoryTaxonomy;

  beforeEach(() => {
    taxonomy = new CategoryTaxonomy();
    oracle = new PriceOracle(taxonomy);
  });

  function makeObservation(
    category: string,
    region: string,
    value: number,
    minutesAgo: number = 0,
    source: string = 'test'
  ): PriceObservation {
    const timestamp = new Date(Date.now() - minutesAgo * 60 * 1000);
    return {
      id: `obs_${Math.random().toString(36).slice(2)}`,
      category,
      region,
      value: new Decimal(value),
      timestamp,
      source,
      confidence: new Decimal(0.9),
    };
  }

  describe('submitObservations', () => {
    it('should accept valid observations', () => {
      const obs = makeObservation('food.grains.wheat', 'us-west', 3.50);
      expect(() => oracle.submitObservations([obs])).not.toThrow();
    });

    it('should reject observations with negative values', () => {
      const obs = makeObservation('food.grains.wheat', 'us-west', -1);
      expect(() => oracle.submitObservations([obs])).toThrow('positive');
    });

    it('should reject future-dated observations', () => {
      const obs = {
        ...makeObservation('food.grains.wheat', 'us-west', 3.50),
        timestamp: new Date(Date.now() + 60 * 60 * 1000),
      };
      expect(() => oracle.submitObservations([obs])).toThrow('future');
    });

    it('should reject observations for non-leaf categories', () => {
      const obs = makeObservation('food', 'us-west', 3.50);
      expect(() => oracle.submitObservations([obs])).toThrow('not a leaf');
    });

    it('should reject observations for unknown categories', () => {
      const obs = makeObservation('nonexistent.category', 'us-west', 3.50);
      expect(() => oracle.submitObservations([obs])).toThrow('Unknown category');
    });

    it('should reject observations older than 7 days', () => {
      const obs = {
        ...makeObservation('food.grains.wheat', 'us-west', 3.50),
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      };
      expect(() => oracle.submitObservations([obs])).toThrow('too old');
    });

    it('should reject zero-value observations', () => {
      const obs = makeObservation('food.grains.wheat', 'us-west', 0);
      expect(() => oracle.submitObservations([obs])).toThrow('positive');
    });
  });

  describe('getCurrentPrice', () => {
    it('should return null when no observations exist', () => {
      const price = oracle.getCurrentPrice('food.grains.wheat', 'us-west');
      expect(price).toBeNull();
    });

    it('should return aggregated price after sufficient observations', () => {
      const cat = 'food.grains.wheat';
      oracle.setAggregationConfig(cat, 'us-west', {
        category: cat, region: 'us-west', method: 'median',
        outlierThreshold: 2.5, minObservations: 3, maxAge: '1h',
      });

      oracle.submitObservations([
        makeObservation(cat, 'us-west', 3.50, 5),
        makeObservation(cat, 'us-west', 3.55, 10),
        makeObservation(cat, 'us-west', 3.48, 15),
      ]);

      const price = oracle.getCurrentPrice(cat, 'us-west');
      expect(price).not.toBeNull();
      expect(price!.value.gt(0)).toBe(true);
      expect(price!.observationCount).toBe(3);
      expect(price!.method).toBe('median');
    });
  });

  describe('outlier filtering', () => {
    it('should exclude extreme outliers from aggregation', () => {
      const cat = 'food.grains.wheat';
      oracle.setAggregationConfig(cat, 'us-west', {
        category: cat, region: 'us-west', method: 'median',
        outlierThreshold: 2.5, minObservations: 3, maxAge: '1h',
      });

      oracle.submitObservations([
        makeObservation(cat, 'us-west', 3.50, 5),
        makeObservation(cat, 'us-west', 3.55, 10),
        makeObservation(cat, 'us-west', 3.48, 15),
        makeObservation(cat, 'us-west', 100.00, 20),
      ]);

      const price = oracle.getCurrentPrice(cat, 'us-west');
      expect(price).not.toBeNull();
      expect(price!.value.lt(5)).toBe(true);
      expect(price!.outlierCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('aggregation methods', () => {
    it('should support mean aggregation', () => {
      const cat = 'food.grains.wheat';
      oracle.setAggregationConfig(cat, 'us-east', {
        category: cat, region: 'us-east', method: 'mean',
        outlierThreshold: 3, minObservations: 3, maxAge: '1h',
      });

      oracle.submitObservations([
        makeObservation(cat, 'us-east', 3.00, 5),
        makeObservation(cat, 'us-east', 4.00, 10),
        makeObservation(cat, 'us-east', 5.00, 15),
      ]);

      const price = oracle.getCurrentPrice(cat, 'us-east');
      expect(price).not.toBeNull();
      expect(price!.method).toBe('mean');
      expect(price!.value.toNumber()).toBeCloseTo(4.0, 1);
    });

    it('should support geometric mean aggregation', () => {
      const cat = 'food.grains.wheat';
      oracle.setAggregationConfig(cat, 'eu', {
        category: cat, region: 'eu', method: 'geometric_mean',
        outlierThreshold: 3, minObservations: 3, maxAge: '1h',
      });

      oracle.submitObservations([
        makeObservation(cat, 'eu', 2.00, 5),
        makeObservation(cat, 'eu', 4.00, 10),
        makeObservation(cat, 'eu', 8.00, 15),
      ]);

      const price = oracle.getCurrentPrice(cat, 'eu');
      expect(price).not.toBeNull();
      expect(price!.method).toBe('geometric_mean');
      expect(price!.value.toNumber()).toBeCloseTo(4.0, 1);
    });
  });

  describe('getPriceSeries', () => {
    it('should return null when no history exists', () => {
      const series = oracle.getPriceSeries('food.grains.wheat', 'us-west', '1d');
      expect(series).toBeNull();
    });
  });

  describe('detectAnomalies', () => {
    it('should return empty array with insufficient data', () => {
      const anomalies = oracle.detectAnomalies('food.grains.wheat', 'us-west', {
        lookbackPeriods: 30, sensitivityThreshold: 2.5,
        minObservationsRequired: 10, enableTrendAnalysis: false,
        enableVolatilityAnalysis: false,
      });
      expect(anomalies).toEqual([]);
    });
  });

  describe('composite indices', () => {
    it('should create and retrieve composite index', () => {
      const index = oracle.createCompositeIndex(
        'food-cpi', 'Food CPI', 'Consumer food price index',
        [
          { categoryId: 'food.grains.wheat', weight: new Decimal(0.3) },
          { categoryId: 'food.grains.rice', weight: new Decimal(0.2) },
        ]
      );

      expect(index.id).toBe('food-cpi');
      expect(index.name).toBe('Food CPI');
      expect(index.components.length).toBe(2);

      const indices = oracle.getCompositeIndices();
      expect(indices.length).toBe(1);
    });
  });

  describe('data sources', () => {
    it('should register a data source', () => {
      expect(() => oracle.registerDataSource({
        id: 'usda', name: 'USDA', type: 'api',
        description: 'USDA price data', categories: ['food'],
        regions: ['us-national'], updateFrequency: '1d',
        reliability: new Decimal(0.95),
      })).not.toThrow();
    });
  });

  describe('taxonomy', () => {
    it('should validate taxonomy consistency', () => {
      const result = taxonomy.validate();
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should find similar categories', () => {
      const similar = taxonomy.getSimilarCategories('food.grains.wheat', 2);
      const ids = similar.map(n => n.id);
      expect(ids).toContain('food.grains.corn');
      expect(ids).toContain('food.grains');
    });

    it('should search categories', () => {
      const results = taxonomy.searchCategories('wheat');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.id === 'food.grains.wheat')).toBe(true);
    });

    it('should refuse to remove categories with children', () => {
      expect(() => taxonomy.removeCategory('food.grains')).toThrow('children');
    });

    it('should remove leaf categories', () => {
      expect(taxonomy.removeCategory('food.grains.corn')).toBe(true);
      expect(taxonomy.getCategory('food.grains.corn')).toBeUndefined();
    });

    it('should calculate composite weight', () => {
      const components = new Map<string, Decimal>();
      components.set('food.grains.wheat', new Decimal(0.5));
      components.set('food.grains.corn', new Decimal(0.3));
      const weight = taxonomy.calculateCompositeWeight('food.grains', components);
      expect(weight.toNumber()).toBeCloseTo(0.8, 5);
    });
  });
});
