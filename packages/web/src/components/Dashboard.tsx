import { TrendingUp, TrendingDown, DollarSign, Shield, Activity, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  // Mock data - would come from API
  const stabilityScore = 0.78;
  const totalHedgedValue = 2450;
  const monthlyExpenses = 3200;
  const hedgingEffectiveness = 0.85;

  const recentActivity = [
    { type: 'buy', market: 'Food Price Index (US West)', amount: '$150', time: '2 hours ago' },
    { type: 'sell', market: 'Housing Cost (California)', amount: '$300', time: '1 day ago' },
    { type: 'rebalance', market: 'Portfolio Auto-Rebalance', amount: '$75 saved', time: '3 days ago' },
  ];

  const categoryBreakdown = [
    { name: 'Food & Groceries', exposure: 1200, hedged: 950, color: 'bg-green-500' },
    { name: 'Housing', exposure: 1500, hedged: 1200, color: 'bg-blue-500' },
    { name: 'Transportation', exposure: 400, hedged: 300, color: 'bg-yellow-500' },
    { name: 'Healthcare', exposure: 100, hedged: 0, color: 'bg-red-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Monitor your hedging performance and portfolio stability</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Shield className={`h-8 w-8 ${stabilityScore > 0.7 ? 'text-green-500' : 'text-yellow-500'}`} />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Stability Score</dt>
                <dd className="text-lg font-medium text-gray-900">{(stabilityScore * 100).toFixed(1)}%</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="h-8 w-8 text-indigo-500" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Hedged Value</dt>
                <dd className="text-lg font-medium text-gray-900">${totalHedgedValue.toLocaleString()}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Monthly Expenses</dt>
                <dd className="text-lg font-medium text-gray-900">${monthlyExpenses.toLocaleString()}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Hedging Effectiveness</dt>
                <dd className="text-lg font-medium text-gray-900">{(hedgingEffectiveness * 100).toFixed(1)}%</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Category Breakdown */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Expense Categories</h3>
          <div className="space-y-4">
            {categoryBreakdown.map((category) => (
              <div key={category.name}>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{category.name}</span>
                  <span>${category.hedged}/${category.exposure} hedged</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`${category.color} h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${(category.hedged / category.exposure) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className={`flex-shrink-0 p-1 rounded-full ${
                  activity.type === 'buy' ? 'bg-green-100' :
                  activity.type === 'sell' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  {activity.type === 'buy' && <TrendingUp className="h-4 w-4 text-green-600" />}
                  {activity.type === 'sell' && <TrendingDown className="h-4 w-4 text-red-600" />}
                  {activity.type === 'rebalance' && <Activity className="h-4 w-4 text-blue-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{activity.market}</p>
                  <p className="text-sm text-gray-500">{activity.amount} • {activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-8 card">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">Rebalancing Recommendation</h3>
            <p className="mt-1 text-sm text-gray-600">
              Your healthcare exposure is currently unhedged. Consider adding positions in Healthcare Price Index markets 
              to improve your stability score. Projected improvement: +8.2%
            </p>
            <div className="mt-3">
              <button className="btn-primary text-sm">
                Auto-Rebalance Portfolio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
