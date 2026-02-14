import React, { useState } from 'react';
import { DollarSign, Plus, Trash2, Upload, Zap, ChevronRight, Check } from 'lucide-react';

interface ExpenseItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  isFixed: boolean;
}

const expenseCategories = [
  { group: 'Food', items: ['groceries', 'dining_out', 'beverages', 'specialty_food'] },
  { group: 'Housing', items: ['rent', 'mortgage', 'utilities', 'home_insurance', 'property_tax', 'maintenance'] },
  { group: 'Transport', items: ['fuel', 'vehicle_insurance', 'public_transit', 'vehicle_maintenance', 'parking'] },
  { group: 'Healthcare', items: ['health_insurance', 'medications', 'dental', 'vision', 'mental_health'] },
  { group: 'Energy', items: ['electricity', 'gas', 'heating_oil', 'renewable_energy'] },
  { group: 'Tech', items: ['internet', 'mobile', 'software_subscriptions', 'devices'] },
  { group: 'Other', items: ['clothing', 'household_goods', 'personal_care', 'other'] },
];

const frequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'annually', 'one-time'];

const defaultExpenses: ExpenseItem[] = [
  { id: '1', name: 'Grocery shopping', category: 'groceries', amount: 600, frequency: 'monthly', isFixed: false },
  { id: '2', name: 'Rent', category: 'rent', amount: 1800, frequency: 'monthly', isFixed: true },
  { id: '3', name: 'Electricity', category: 'electricity', amount: 120, frequency: 'monthly', isFixed: false },
  { id: '4', name: 'Car fuel', category: 'fuel', amount: 200, frequency: 'monthly', isFixed: false },
  { id: '5', name: 'Health insurance', category: 'health_insurance', amount: 350, frequency: 'monthly', isFixed: true },
];

type Step = 'expenses' | 'preferences' | 'review';

export default function ExpenseSetup() {
  const [step, setStep] = useState<Step>('expenses');
  const [expenses, setExpenses] = useState<ExpenseItem[]>(defaultExpenses);
  const [riskTolerance, setRiskTolerance] = useState(0.5);
  const [hedgingBudget, setHedgingBudget] = useState(200);
  const [autoRebalance, setAutoRebalance] = useState(true);
  const [region, setRegion] = useState('us-west');

  const addExpense = () => {
    const newExpense: ExpenseItem = {
      id: Date.now().toString(),
      name: '',
      category: 'other',
      amount: 0,
      frequency: 'monthly',
      isFixed: false,
    };
    setExpenses([...expenses, newExpense]);
  };

  const updateExpense = (id: string, field: keyof ExpenseItem, value: any) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const totalMonthly = expenses.reduce((sum, e) => {
    const multipliers: Record<string, number> = {
      daily: 30.44, weekly: 4.33, monthly: 1, quarterly: 1 / 3, annually: 1 / 12, 'one-time': 0,
    };
    return sum + e.amount * (multipliers[e.frequency] || 1);
  }, 0);

  const fixedPct = expenses.filter(e => e.isFixed).reduce((sum, e) => sum + e.amount, 0) / totalMonthly * 100;

  const steps: { key: Step; label: string }[] = [
    { key: 'expenses', label: 'Expenses' },
    { key: 'preferences', label: 'Preferences' },
    { key: 'review', label: 'Review' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Expense Profile Setup</h1>
        <p className="text-gray-600">Tell us about your expenses so we can build your personalized hedging basket</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
            <button
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === s.key
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                step === s.key ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {i + 1}
              </span>
              {s.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Step: Expenses */}
      {step === 'expenses' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Your Expenses</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                <Upload className="h-3.5 w-3.5" />
                Import CSV
              </button>
              <button
                onClick={addExpense}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Expense
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="card flex gap-3 items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                  <input
                    type="text"
                    value={expense.name}
                    onChange={(e) => updateExpense(expense.id, 'name', e.target.value)}
                    placeholder="Expense name"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <select
                    value={expense.category}
                    onChange={(e) => updateExpense(expense.id, 'category', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {expenseCategories.map(group => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map(item => (
                          <option key={item} value={item}>
                            {item.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      value={expense.amount || ''}
                      onChange={(e) => updateExpense(expense.id, 'amount', parseFloat(e.target.value) || 0)}
                      placeholder="Amount"
                      className="pl-7 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <select
                    value={expense.frequency}
                    onChange={(e) => updateExpense(expense.id, 'frequency', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {frequencies.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={expense.isFixed}
                        onChange={(e) => updateExpense(expense.id, 'isFixed', e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Fixed
                    </label>
                  </div>
                </div>
                <button
                  onClick={() => removeExpense(expense.id)}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Estimated Monthly Expenses</p>
              <p className="text-2xl font-bold text-gray-900">${totalMonthly.toFixed(2)}</p>
              <p className="text-xs text-gray-400">{fixedPct.toFixed(0)}% fixed · {(100 - fixedPct).toFixed(0)}% variable</p>
            </div>
            <button
              onClick={() => setStep('preferences')}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Next: Preferences
            </button>
          </div>
        </div>
      )}

      {/* Step: Preferences */}
      {step === 'preferences' && (
        <div className="space-y-8">
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Risk Tolerance</h3>
            <p className="text-sm text-gray-600 mb-4">
              How aggressively should we hedge? Conservative means more positions with tighter rebalancing.
            </p>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-sm text-gray-500 mt-2">
              <span>Conservative (0)</span>
              <span className="font-medium text-indigo-600">{riskTolerance.toFixed(2)}</span>
              <span>Aggressive (1)</span>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Hedging Budget</h3>
            <p className="text-sm text-gray-600 mb-4">
              How much per month are you willing to allocate to hedging positions?
            </p>
            <div className="flex items-center gap-4">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <input
                type="number"
                value={hedgingBudget}
                onChange={(e) => setHedgingBudget(parseFloat(e.target.value) || 0)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-lg font-medium w-40 focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-500">
                ({((hedgingBudget / totalMonthly) * 100).toFixed(1)}% of monthly expenses)
              </span>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Region</h3>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="us-northeast">US Northeast</option>
              <option value="us-southeast">US Southeast</option>
              <option value="us-midwest">US Midwest</option>
              <option value="us-west">US West</option>
              <option value="us-southwest">US Southwest</option>
              <option value="eu-north">EU North</option>
              <option value="eu-south">EU South</option>
              <option value="eu-central">EU Central</option>
              <option value="asia-east">Asia East</option>
              <option value="asia-southeast">Asia Southeast</option>
              <option value="global">Global</option>
            </select>
          </div>

          <div className="card">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={autoRebalance}
                onChange={(e) => setAutoRebalance(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5"
              />
              <div>
                <p className="font-medium text-gray-900">Auto-Rebalance</p>
                <p className="text-sm text-gray-500">Automatically rebalance when positions drift beyond threshold</p>
              </div>
            </label>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('expenses')}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Monthly Expenses</p>
                <p className="text-lg font-bold">${totalMonthly.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Expense Items</p>
                <p className="text-lg font-bold">{expenses.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Hedging Budget</p>
                <p className="text-lg font-bold">${hedgingBudget}/mo</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Risk Tolerance</p>
                <p className="text-lg font-bold">{riskTolerance.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Expense Breakdown</h3>
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span className="text-gray-700">{expense.name || expense.category.replace(/_/g, ' ')}</span>
                  <span className="font-medium">
                    ${expense.amount}/{expense.frequency}
                    {expense.isFixed && <span className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded">fixed</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-indigo-50 border-indigo-200">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-indigo-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-indigo-900">Ready to Generate Your Hedging Basket</h3>
                <p className="text-sm text-indigo-700 mt-1">
                  Our optimizer will use mean-variance optimization to construct a basket that minimizes 
                  Var(net_cost) = Var(expenses) + Var(positions) − 2·Cov(expenses, positions).
                  This targets markets with <em>negative</em> correlation to your expense categories.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('preferences')}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-lg font-medium">
              <Check className="h-5 w-5" />
              Generate Basket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
