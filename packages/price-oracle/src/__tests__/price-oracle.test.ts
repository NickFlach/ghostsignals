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
      confidence: 0.9,
    };
  }

  describe('submitObservations', () => {
    it('should accept valid observations', () => {
      // Use a leaf category from the taxonomy
      const leafCategories = getLeafCategories(taxonomy);
      if (leafCategories.length === 0) return; // Skip if no leaf categories

      const cat = leafCategories[0];
      const obs = makeObservation(cat, 'us-west', 3.50);

      expect(() => oracle.submitObservations([obs])).not.toThrow();
    });

    it('should reject observations with negative values', () => {
      const leafCategories = getLeafCategories(taxonomy);
      if (leafCategories.length === 0) return;

      const cat = leafCategories[0];
      const obs = makeObservation(cat, 'us-west', -1);

      expect(() => oracle.submitObservations([obs])).toThrow('positive');
    });

    it('should reject future-dated observations', () => {
      const leafCategories = getLeafCategories(taxonomy);
      if (leafCategories.length === 0) return;

      const cat = leafCategories[0];
      const obs = {
        ...makeObservation(cat, 'us-west', 3.50),
        timestamp: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in future
      };

      expect(() => oracle.submitObservations([obs])).toThrow('future');
    });
  });

  describe('getCurrentPrice', () => {
    it('should return null when no observations exist', () => {
      const price = oracle.getCurrentPrice('food.grains.wheat', 'us-west');
      expect(price).toBeNull();
    });

    it('should return aggregated price after sufficient observations', () => {
      const leafCategories = getLeafCategories(taxonomy);
      if (leafCategories.length === 0) return;

      const cat = leafCategories[0];

      // Set aggregation config with low minimum
      oracle.setAggregationConfig(cat, 'us-west', {
        category: cat,
        region: 'us-west',
        method: 'median',
        outlierThreshold: 2.5,
        minObservations: 3,
        maxAge: '1h',
      });

      // Submit enough observations
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

  describe('getPriceSeries', () => {
    it('should return null when no history exists', () => {
      const series = oracle.getPriceSeries('food.grains.wheat', 'us-west', '1d');
      expect(series).toBeNull();
    });
  });

  describe('detectAnomalies', () => {
    it('should return empty array with insufficient data', () => {
      const anomalies = oracle.detectAnomalies('food.grains.wheat', 'us-west', {
        lookbackPeriods: 30,
        sensitivityThreshold: 2.5,
        minObservationsRequired: 10,
        enableTrendAnalysis: false,
        enableVolatilityAnalysis: false,
      });

      expect(anomalies).toEqual([]);
    });
  });

  describe('composite indices', () => {
    it('should create and retrieve composite index', () => {
      const index = oracle.createCompositeIndex(
        'food-cpi',
        'Food CPI',
        'Consumer food price index',
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
        id: 'usda',
        name: 'USDA',
        type: 'api',
        description: 'USDA price data',
        categories: ['food'],
        regions: ['us-national'],
        updateFrequency: '1d',
        reliability: new Decimal(0.95),
      })).not.toThrow();
    });
  });
});

// Helper to find leaf categories in taxonomy
function getLeafCategories(taxonomy: CategoryTaxonomy): string[] {
  // Try some known leaf category paths
  const candidates = [
    'food.grains.wheat',
    'food.grains.rice',
    'food.dairy.milk',
    'energy.electricity.residential',
  ];

  return candidates.filter(id => {
    try {
      const node = taxonomy.getCategory(id);
      return node && node.isLeaf;
    } catch {
      return false;
    }
  });
}
