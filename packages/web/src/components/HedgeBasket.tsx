import React, { useState } from 'react';
import { Shield, TrendingUp, TrendingDown, RefreshCw, Plus, Minus, PieChart, AlertTriangle } from 'lucide-react';

interface Position {
  marketId: string;
  marketName: string;
  category: string;
  shares: number;
  costBasis: number;
  currentValue: number;
  hedgeRatio: number;
  targetWeight: number;
  actualWeight: number;
  pnl: number;
}

interface BasketData {
  stabilityScore: number;
  hedgingEffectiveness: number;
  totalValue: number;
  totalCost: number;
  lastRebalance: string;
  rebalanceCount: number;
  positions: Position[];
}

// Mock data — will be replaced with API calls
const mockBasket: BasketData = {
  stabilityScore: 0.78,
  hedgingEffectiveness: 0.85,
  totalValue: 2650,
  totalCost: 2450,
  lastRebalance: '2026-02-10',
  rebalanceCount: 3,
  positions: [
    {
      marketId: 'm1', marketName: 'Food Price Index (US West)', category: 'food',
      shares: 150, costBasis: 750, currentValue: 810, hedgeRatio: 0.72,
      targetWeight: 0.30, actualWeight: 0.31, pnl: 60,
    },
    {
      marketId: 'm2', marketName: 'Housing Cost Index (California)', category: 'housing',
      shares: 200, costBasis: 1100, currentValue: 1080, hedgeRatio: 0.65,
      targetWeight: 0.45, actualWeight: 0.41, pnl: -20,
    },
    {
      marketId: 'm3', marketName: 'Energy Price (US Southwest)', category: 'energy',
      shares: 80, costBasis: 320, currentValue: 400, hedgeRatio: 0.58,
      targetWeight: 0.13, actualWeight: 0.15, pnl: 80,
    },
    {
      marketId: 'm4', marketName: 'Transport Cost (US West)', category: 'transport',
      shares: 50, costBasis: 280, currentValue: 360, hedgeRatio: 0.45,
      targetWeight: 0.12, actualWeight: 0.13, pnl: 80,
    },
  ],
};

const rebalanceRecommendation = {
  recommendRebalance: true,
  urgency: 'medium' as const,
  reason: 'Housing position drift exceeds threshold (4.0%). Energy overweight by 2%.',
  projectedImprovement: 0.04,
  estimatedCost: 12.50,
};

const categoryColors: Record<string, string> = {
  food: 'bg-green-500',
  housing: 'bg-blue-500',
  energy: 'bg-yellow-500',
  transport: 'bg-purple-500',
  healthcare: 'bg-red-500',
  tech: 'bg-cyan-500',
  materials: 'bg-orange-500',
};

export default function HedgeBasket() {
  const [basket] = useState<BasketData>(mockBasket);
  const [showSimulation, setShowSimulation] = useState(false);

  const totalPnl = basket.positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPnlPct = (totalPnl / basket.totalCost) * 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Hedging Basket</h1>
          <p className="text-gray-600">Your personalized risk basket built from your expense profile</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSimulation(!showSimulation)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <PieChart className="h-4 w-4" />
            Simulate
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Rebalance
          </button>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-3">
            <Shield className={`h-8 w-8 ${basket.stabilityScore >= 0.7 ? 'text-green-500' : 'text-yellow-500'}`} />
            <div>
              <p className="text-sm text-gray-500">Stability Score</p>
              <p className="text-2xl font-bold">{(basket.stabilityScore * 100).toFixed(1)}%</p>
              <p className="text-xs text-gray-400">S = 1 − σ(hedged)/σ(unhedged)</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-indigo-500" />
            <div>
              <p className="text-sm text-gray-500">Hedge Effectiveness</p>
              <p className="text-2xl font-bold">{(basket.hedgingEffectiveness * 100).toFixed(1)}%</p>
              <p className="text-xs text-gray-400">Expense variance reduction</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${totalPnl >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {totalPnl >= 0 ? <Plus className="h-5 w-5 text-green-600" /> : <Minus className="h-5 w-5 text-red-600" />}
            </div>
            <div>
              <p className="text-sm text-gray-500">Total P&L</p>
              <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">{totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div>
            <p className="text-sm text-gray-500">Portfolio Value</p>
            <p className="text-2xl font-bold">${basket.totalValue.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Cost basis: ${basket.totalCost.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Rebalance recommendation */}
      {rebalanceRecommendation.recommendRebalance && (
        <div className={`mb-8 p-4 rounded-lg border-l-4 ${
          rebalanceRecommendation.urgency === 'high' ? 'bg-red-50 border-red-500' :
          rebalanceRecommendation.urgency === 'medium' ? 'bg-amber-50 border-amber-500' :
          'bg-blue-50 border-blue-500'
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 mt-0.5 ${
              rebalanceRecommendation.urgency === 'high' ? 'text-red-500' :
              rebalanceRecommendation.urgency === 'medium' ? 'text-amber-500' :
              'text-blue-500'
            }`} />
            <div>
              <h3 className="font-medium text-gray-900">
                Rebalance Recommended ({rebalanceRecommendation.urgency} urgency)
              </h3>
              <p className="text-sm text-gray-600 mt-1">{rebalanceRecommendation.reason}</p>
              <p className="text-sm text-gray-500 mt-1">
                Projected improvement: +{(rebalanceRecommendation.projectedImprovement * 100).toFixed(1)}% stability
                · Est. cost: ${rebalanceRecommendation.estimatedCost.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Allocation chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Allocation</h3>
          <div className="flex h-4 rounded-full overflow-hidden mb-4">
            {basket.positions.map((pos) => (
              <div
                key={pos.marketId}
                className={`${categoryColors[pos.category] || 'bg-gray-400'}`}
                style={{ width: `${pos.actualWeight * 100}%` }}
                title={`${pos.category}: ${(pos.actualWeight * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="space-y-2">
            {basket.positions.map((pos) => (
              <div key={pos.marketId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${categoryColors[pos.category] || 'bg-gray-400'}`} />
                  <span className="capitalize">{pos.category}</span>
                </div>
                <div className="text-gray-600">
                  <span className="font-medium">{(pos.actualWeight * 100).toFixed(1)}%</span>
                  <span className="text-gray-400 ml-1">
                    (target: {(pos.targetWeight * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Positions table */}
        <div className="card lg:col-span-2">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Positions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Market</th>
                  <th className="pb-2 text-right">Shares</th>
                  <th className="pb-2 text-right">Value</th>
                  <th className="pb-2 text-right">P&L</th>
                  <th className="pb-2 text-right">Hedge Ratio</th>
                </tr>
              </thead>
              <tbody>
                {basket.positions.map((pos) => (
                  <tr key={pos.marketId} className="border-b border-gray-100">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{pos.marketName}</p>
                      <p className="text-xs text-gray-400 capitalize">{pos.category}</p>
                    </td>
                    <td className="py-3 text-right">{pos.shares}</td>
                    <td className="py-3 text-right">${pos.currentValue.toLocaleString()}</td>
                    <td className={`py-3 text-right font-medium ${pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{ width: `${pos.hedgeRatio * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-600">{(pos.hedgeRatio * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Simulation panel */}
      {showSimulation && (
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Monte Carlo Simulation</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Expected Stability (30d)</p>
              <p className="text-xl font-bold text-gray-900">76.2%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Stability Range (90% CI)</p>
              <p className="text-xl font-bold text-gray-900">62% – 89%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Variance Reduction</p>
              <p className="text-xl font-bold text-gray-900">38.1%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Win Rate</p>
              <p className="text-xl font-bold text-green-600">87.3%</p>
              <p className="text-xs text-gray-400">% scenarios where hedging helped</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">Based on 1,000 Monte Carlo scenarios over 30 days</p>
        </div>
      )}

      {/* Info footer */}
      <div className="mt-8 text-center text-sm text-gray-400">
        <p>Last rebalance: {basket.lastRebalance} · Total rebalances: {basket.rebalanceCount}</p>
        <p className="mt-1">
          Stability Score: S = 1 − σ(hedged)/σ(unhedged) · Higher is better
        </p>
      </div>
    </div>
  );
}
