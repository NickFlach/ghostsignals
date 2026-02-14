import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ExpenseProfiler, ImportedTransaction } from '../expense-profiler.js';

describe('ExpenseProfiler', () => {
  const profiler = new ExpenseProfiler();

  const createSampleTransactions = (): ImportedTransaction[] => [
    {
      date: new Date('2024-01-15'),
      amount: new Decimal(500),
      description: 'Grocery Store',
      category: 'groceries',
      isIncome: false
    },
    {
      date: new Date('2024-01-01'),
      amount: new Decimal(1200),
      description: 'Rent Payment',
      category: 'rent',
      isIncome: false
    },
    {
      date: new Date('2024-02-15'),
      amount: new Decimal(450),
      description: 'Grocery Store',
      category: 'groceries',
      isIncome: false
    },
    {
      date: new Date('2024-02-01'),
      amount: new Decimal(1200),
      description: 'Rent Payment',
      category: 'rent',
      isIncome: false
    }
  ];

  it('should create expense profile from transactions', () => {
    const transactions = createSampleTransactions();
    const profile = profiler.createProfileFromTransactions(
      'user123',
      transactions,
      0.5,
      new Decimal(200),
      'Test Profile'
    );

    expect(profile.userId).toBe('user123');
    expect(profile.name).toBe('Test Profile');
    expect(profile.expenses.length).toBeGreaterThan(0);
    expect(profile.totalMonthlyExpenses.gt(0)).toBe(true);
    expect(profile.riskTolerance).toBe(0.5);
    expect(profile.hedgingBudget.toString()).toBe('200');
  });

  it('should analyze expense patterns correctly', () => {
    const transactions = createSampleTransactions();
    const analysis = profiler.analyzeExpensePatterns(transactions);

    expect(analysis.totalMonthlyExpenses.gt(0)).toBe(true);
    expect(analysis.categoryBreakdown.size).toBeGreaterThan(0);
    expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
    expect(analysis.riskScore).toBeLessThanOrEqual(1);
  });

  it('should predict future expenses', () => {
    const transactions = createSampleTransactions();
    const profile = profiler.createProfileFromTransactions(
      'user123',
      transactions,
      0.5,
      new Decimal(200)
    );

    const prediction = profiler.predictFutureExpenses(profile, 3); // 3 months ahead

    expect(prediction.expectedAmount.gt(0)).toBe(true);
    expect(prediction.lowerBound.lte(prediction.expectedAmount)).toBe(true);
    expect(prediction.upperBound.gte(prediction.expectedAmount)).toBe(true);
    expect(prediction.byCategory.size).toBeGreaterThan(0);
  });
});