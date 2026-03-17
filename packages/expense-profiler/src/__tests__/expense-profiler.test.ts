import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { LocalExpenseProfiler } from '../index.js';
import type { ImportedTransaction } from '@ghostsignals/hedge-engine';

describe('LocalExpenseProfiler', () => {
  let profiler: LocalExpenseProfiler;

  beforeEach(() => {
    profiler = new LocalExpenseProfiler();
  });

  describe('categorizeExpense', () => {
    const cases: Array<[string, string]> = [
      ['Walmart Grocery Store', 'groceries'],
      ['Whole Foods Supermarket', 'groceries'],
      ['Olive Garden Restaurant', 'dining_out'],
      ['Starbucks Cafe', 'dining_out'],
      ['Monthly Rent Payment', 'rent'],
      ['Home Mortgage Payment', 'mortgage'],
      ['Electric Company Bill', 'electricity'],
      ['Shell Gas Station Fuel', 'fuel'],
      ['Metro Transit Pass', 'public_transit'],
      ['CVS Pharmacy Medication', 'medications'],
      ['Doctor Visit Copay', 'health_insurance'],
      ['Dental Checkup', 'dental'],
      ['Comcast Internet Service', 'internet'],
      ['Verizon Mobile Phone', 'mobile'],
      ['Netflix Subscription', 'software_subscriptions'],
      ['Nordstrom Clothing', 'clothing'],
      ['Amazon Purchase', 'household_goods'],
      ['Random Unknown Vendor', 'other'],
    ];

    it.each(cases)('should categorize "%s" as %s', (description, expected) => {
      expect(profiler.categorizeExpense(description)).toBe(expected);
    });
  });

  describe('detectRecurringTransactions', () => {
    it('should detect recurring transactions with same amount and description', () => {
      const transactions: ImportedTransaction[] = [
        { date: new Date('2026-01-01'), amount: new Decimal(9.99), description: 'Netflix Monthly', category: 'software_subscriptions', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(9.99), description: 'Netflix Monthly', category: 'software_subscriptions', isIncome: false },
        { date: new Date('2026-03-01'), amount: new Decimal(9.99), description: 'Netflix Monthly', category: 'software_subscriptions', isIncome: false },
        { date: new Date('2026-01-15'), amount: new Decimal(75.00), description: 'One-time purchase', category: 'other', isIncome: false },
      ];

      const result = profiler.detectRecurringTransactions(transactions);
      expect(result.recurring.length).toBe(1);
      expect(result.recurring[0].length).toBe(3);
      expect(result.oneTime.length).toBe(1);
    });

    it('should handle empty transaction list', () => {
      const result = profiler.detectRecurringTransactions([]);
      expect(result.recurring.length).toBe(0);
      expect(result.oneTime.length).toBe(0);
    });

    it('should match transactions within 5% amount tolerance', () => {
      const transactions: ImportedTransaction[] = [
        { date: new Date('2026-01-01'), amount: new Decimal(100.00), description: 'Electric Bill', category: 'electricity', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(104.50), description: 'Electric Bill', category: 'electricity', isIncome: false },
      ];

      const result = profiler.detectRecurringTransactions(transactions);
      expect(result.recurring.length).toBe(1);
    });
  });

  describe('generateExpenseForecast', () => {
    it('should generate forecast for given months', () => {
      const transactions: ImportedTransaction[] = [
        { date: new Date('2026-01-01'), amount: new Decimal(9.99), description: 'Netflix', category: 'software_subscriptions', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(9.99), description: 'Netflix', category: 'software_subscriptions', isIncome: false },
        { date: new Date('2026-03-01'), amount: new Decimal(9.99), description: 'Netflix', category: 'software_subscriptions', isIncome: false },
      ];

      const forecast = profiler.generateExpenseForecast(transactions, 3);
      expect(forecast.monthlyForecast.length).toBe(3);
      expect(forecast.confidence).toBeGreaterThan(0);
      expect(forecast.monthlyForecast[0].expectedAmount.toNumber()).toBeCloseTo(9.99, 1);
    });

    it('should have higher confidence with more recurring patterns', () => {
      const fewRecurring: ImportedTransaction[] = [
        { date: new Date('2026-01-01'), amount: new Decimal(10), description: 'Sub A', category: 'other', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(10), description: 'Sub A', category: 'other', isIncome: false },
      ];

      const manyRecurring: ImportedTransaction[] = [
        ...fewRecurring,
        { date: new Date('2026-01-01'), amount: new Decimal(20), description: 'Sub B', category: 'other', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(20), description: 'Sub B', category: 'other', isIncome: false },
        { date: new Date('2026-01-01'), amount: new Decimal(30), description: 'Sub C', category: 'other', isIncome: false },
        { date: new Date('2026-02-01'), amount: new Decimal(30), description: 'Sub C', category: 'other', isIncome: false },
      ];

      const f1 = profiler.generateExpenseForecast(fewRecurring, 1);
      const f2 = profiler.generateExpenseForecast(manyRecurring, 1);
      expect(f2.confidence).toBeGreaterThan(f1.confidence);
    });
  });

  describe('processReceipt', () => {
    it('should create transactions from receipt data', async () => {
      const receipt = {
        merchant: 'Walmart',
        amount: 45.99,
        date: new Date('2026-03-01'),
        items: [
          { name: 'Bread', amount: 3.99 },
          { name: 'Milk', amount: 4.99 },
          { name: 'Chicken', amount: 12.99 },
        ],
      };

      const transactions = await profiler.processReceipt(receipt);
      // 1 total + 3 itemized
      expect(transactions.length).toBe(4);
      expect(transactions[0].category).toBe('groceries'); // Walmart
      expect(transactions[0].amount.toNumber()).toBe(45.99);
    });

    it('should not itemize single-item receipts', async () => {
      const receipt = {
        merchant: 'Shell',
        amount: 55.00,
        date: new Date('2026-03-01'),
        items: [{ name: 'Gasoline', amount: 55.00 }],
      };

      const transactions = await profiler.processReceipt(receipt);
      expect(transactions.length).toBe(1);
      expect(transactions[0].category).toBe('fuel');
    });
  });
});
