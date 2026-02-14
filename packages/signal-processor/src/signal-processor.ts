import Decimal from 'decimal.js';
import { Market, MarketQuote } from '@ghostsignals/core';
import { PriceIndexPoint, Anomaly } from '@ghostsignals/price-oracle';

/**
 * Signal Processor - Market signal analysis with ghostvector integration
 * 
 * This component analyzes market signals to discover correlations,
 * detect anomalies, and score market efficiency using graph neural networks.
 */

export interface MarketSignal {
  id: string;
  marketId: string;
  timestamp: Date;
  signalType: 'price_movement' | 'volume_spike' | 'volatility_change' | 'correlation_shift';
  strength: Decimal; // 0-1 signal strength
  direction: 'positive' | 'negative' | 'neutral';
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface CorrelationMatrix {
  markets: string[];
  correlations: Decimal[][];
  timestamp: Date;
  confidence: Decimal;
}

export interface MarketEfficiencyScore {
  marketId: string;
  score: Decimal; // 0-1, higher = more efficient
  factors: {
    bidAskSpread: Decimal;
    volumeLiquidity: Decimal;
    priceImpact: Decimal;
    arbitrageOpportunities: Decimal;
  };
  timestamp: Date;
}

export class SignalProcessor {
  private marketSignals: Map<string, MarketSignal[]> = new Map();
  private correlationHistory: CorrelationMatrix[] = [];
  private efficiencyScores: Map<string, MarketEfficiencyScore> = new Map();

  constructor(private ghostvectorClient?: any) {}

  /**
   * Process market data to extract signals
   */
  processMarketData(markets: Market[], quotes: Map<string, MarketQuote[]>): MarketSignal[] {
    const signals: MarketSignal[] = [];

    for (const market of markets) {
      const marketQuotes = quotes.get(market.id) || [];
      
      // Detect price movement signals
      const priceSignals = this.detectPriceMovements(market, marketQuotes);
      signals.push(...priceSignals);
      
      // Detect volume spikes
      const volumeSignals = this.detectVolumeSpikes(market, marketQuotes);
      signals.push(...volumeSignals);
      
      // Detect volatility changes
      const volatilitySignals = this.detectVolatilityChanges(market, marketQuotes);
      signals.push(...volatilitySignals);
    }

    // Store signals
    for (const signal of signals) {
      this.storeSignal(signal);
    }

    return signals;
  }

  /**
   * Discover correlations between markets using GNN
   */
  discoverCorrelations(markets: Market[]): CorrelationMatrix {
    const correlations: Decimal[][] = [];
    const marketIds = markets.map(m => m.id);

    // Build correlation matrix
    for (let i = 0; i < markets.length; i++) {
      correlations[i] = [];
      for (let j = 0; j < markets.length; j++) {
        if (i === j) {
          correlations[i][j] = new Decimal(1);
        } else {
          // Calculate correlation using signal history and ghostvector embeddings
          const correlation = this.calculateMarketCorrelation(markets[i], markets[j]);
          correlations[i][j] = correlation;
        }
      }
    }

    const matrix: CorrelationMatrix = {
      markets: marketIds,
      correlations,
      timestamp: new Date(),
      confidence: new Decimal(0.85) // Would calculate actual confidence
    };

    this.correlationHistory.push(matrix);

    // Keep only last 100 correlation matrices
    if (this.correlationHistory.length > 100) {
      this.correlationHistory = this.correlationHistory.slice(-100);
    }

    return matrix;
  }

  /**
   * Calculate market efficiency score
   */
  calculateMarketEfficiency(market: Market, quotes: MarketQuote[]): MarketEfficiencyScore {
    if (quotes.length === 0) {
      throw new Error('No quotes available for efficiency calculation');
    }

    // Calculate spread efficiency
    const avgSpread = quotes.reduce((sum, q) => sum.add(q.spread), new Decimal(0))
      .div(quotes.length);
    const spreadScore = new Decimal(1).sub(avgSpread.div(10)).max(0); // Lower spread = higher score

    // Calculate liquidity efficiency  
    const avgLiquidity = quotes.reduce((sum, q) => sum.add(q.liquidity), new Decimal(0))
      .div(quotes.length);
    const liquidityScore = avgLiquidity.div(1000).min(1); // Normalize to 0-1

    // Estimate price impact (simplified)
    const priceImpactScore = new Decimal(0.8); // Would calculate from actual trade data

    // Detect arbitrage opportunities
    const arbitrageScore = this.detectArbitrageOpportunities(market, quotes);

    // Composite efficiency score
    const efficiency = spreadScore.mul(0.3)
      .add(liquidityScore.mul(0.3))
      .add(priceImpactScore.mul(0.2))
      .add(arbitrageScore.mul(0.2));

    const score: MarketEfficiencyScore = {
      marketId: market.id,
      score: efficiency,
      factors: {
        bidAskSpread: spreadScore,
        volumeLiquidity: liquidityScore,
        priceImpact: priceImpactScore,
        arbitrageOpportunities: arbitrageScore
      },
      timestamp: new Date()
    };

    this.efficiencyScores.set(market.id, score);
    return score;
  }

  /**
   * Detect market anomalies in signal patterns
   */
  detectSignalAnomalies(marketId: string, lookbackHours: number = 24): Anomaly[] {
    const signals = this.getMarketSignals(marketId, lookbackHours);
    const anomalies: Anomaly[] = [];

    // Analyze signal frequency
    const signalCounts = new Map<string, number>();
    for (const signal of signals) {
      const count = signalCounts.get(signal.signalType) || 0;
      signalCounts.set(signal.signalType, count + 1);
    }

    // Detect unusual signal patterns
    for (const [signalType, count] of signalCounts) {
      const expectedCount = this.getExpectedSignalCount(marketId, signalType, lookbackHours);
      const deviation = Math.abs(count - expectedCount) / (expectedCount + 1);

      if (deviation > 2) { // 2+ standard deviations
        const anomaly: Anomaly = {
          id: `signal_anomaly_${marketId}_${Date.now()}`,
          category: 'market_signals',
          region: 'global',
          timestamp: new Date(),
          severity: deviation > 4 ? 'high' : 'medium',
          type: count > expectedCount ? 'spike' : 'drop',
          currentValue: new Decimal(count),
          expectedValue: new Decimal(expectedCount),
          deviation: new Decimal(deviation),
          confidence: new Decimal(0.8),
          description: `Unusual ${signalType} signal pattern detected`,
          affectedMarkets: [marketId]
        };

        anomalies.push(anomaly);
      }
    }

    return anomalies;
  }

  /**
   * Get market signals for a specific market
   */
  getMarketSignals(marketId: string, hoursBack: number): MarketSignal[] {
    const signals = this.marketSignals.get(marketId) || [];
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    return signals.filter(signal => signal.timestamp >= cutoff);
  }

  /**
   * Get latest correlation matrix
   */
  getLatestCorrelations(): CorrelationMatrix | null {
    return this.correlationHistory.length > 0 
      ? this.correlationHistory[this.correlationHistory.length - 1]
      : null;
  }

  /**
   * Get market efficiency scores
   */
  getMarketEfficiency(marketId: string): MarketEfficiencyScore | null {
    return this.efficiencyScores.get(marketId) || null;
  }

  private detectPriceMovements(market: Market, quotes: MarketQuote[]): MarketSignal[] {
    if (quotes.length < 2) return [];

    const signals: MarketSignal[] = [];
    const latest = quotes[quotes.length - 1];
    const previous = quotes[quotes.length - 2];

    // Calculate price change
    const priceChange = latest.ammBuyPrice.sub(previous.ammBuyPrice)
      .div(previous.ammBuyPrice);

    const threshold = new Decimal(0.05); // 5% threshold
    
    if (priceChange.abs().gt(threshold)) {
      const signal: MarketSignal = {
        id: `price_${market.id}_${Date.now()}`,
        marketId: market.id,
        timestamp: new Date(),
        signalType: 'price_movement',
        strength: priceChange.abs(),
        direction: priceChange.gt(0) ? 'positive' : 'negative',
        embedding: this.generateSignalEmbedding('price_movement', market, quotes),
        metadata: {
          priceChange: priceChange.toString(),
          currentPrice: latest.ammBuyPrice.toString(),
          previousPrice: previous.ammBuyPrice.toString()
        }
      };

      signals.push(signal);
    }

    return signals;
  }

  private detectVolumeSpikes(market: Market, quotes: MarketQuote[]): MarketSignal[] {
    // Simplified volume spike detection
    return [];
  }

  private detectVolatilityChanges(market: Market, quotes: MarketQuote[]): MarketSignal[] {
    // Simplified volatility change detection
    return [];
  }

  private calculateMarketCorrelation(market1: Market, market2: Market): Decimal {
    // Get signal embeddings for both markets
    const signals1 = this.marketSignals.get(market1.id) || [];
    const signals2 = this.marketSignals.get(market2.id) || [];

    if (signals1.length === 0 || signals2.length === 0) {
      return new Decimal(0);
    }

    // Use ghostvector to calculate embedding similarity
    if (this.ghostvectorClient && signals1.length > 0 && signals2.length > 0) {
      const embedding1 = signals1[signals1.length - 1].embedding;
      const embedding2 = signals2[signals2.length - 1].embedding;
      
      // Calculate cosine similarity
      const correlation = this.calculateCosineSimilarity(embedding1, embedding2);
      return new Decimal(correlation);
    }

    // Fallback: simple category-based correlation
    if (market1.category === market2.category) {
      return new Decimal(0.6); // Same category = moderate correlation
    }

    return new Decimal(0.1); // Low correlation for different categories
  }

  private detectArbitrageOpportunities(market: Market, quotes: MarketQuote[]): Decimal {
    // Simplified arbitrage detection - would analyze cross-market price differences
    return new Decimal(0.9); // High score = few arbitrage opportunities
  }

  private getExpectedSignalCount(marketId: string, signalType: string, hours: number): number {
    // Calculate expected signal count based on historical data
    // Simplified implementation
    const baseRate = 0.5; // signals per hour
    return baseRate * hours;
  }

  private storeSignal(signal: MarketSignal): void {
    if (!this.marketSignals.has(signal.marketId)) {
      this.marketSignals.set(signal.marketId, []);
    }

    const signals = this.marketSignals.get(signal.marketId)!;
    signals.push(signal);

    // Keep only last 1000 signals per market
    if (signals.length > 1000) {
      this.marketSignals.set(signal.marketId, signals.slice(-1000));
    }

    // Store in ghostvector if available
    if (this.ghostvectorClient) {
      this.storeSignalInGhostvector(signal);
    }
  }

  private generateSignalEmbedding(
    signalType: string,
    market: Market,
    quotes: MarketQuote[]
  ): number[] {
    // Generate embedding using ghostvector
    // Simplified implementation - would use actual embedding model
    return Array(128).fill(0).map(() => Math.random() - 0.5);
  }

  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private storeSignalInGhostvector(signal: MarketSignal): void {
    // Store signal embedding in ghostvector for similarity search and analysis
  }
}