import Decimal from 'decimal.js';
import { 
  ExpenseProfile, 
  ExpenseItem, 
  ExpenseCategory, 
  ExpenseFrequency,
  EXPENSE_TO_MARKET_CATEGORY
} from './schemas.js';
import { MarketCategory } from '@ghostsignals/core';

/**
 * Expense Profiler - Analyzes user expenses and creates profiles
 * 
 * This component processes user expense data to create comprehensive profiles
 * that can be used for hedging optimization. It handles categorization,
 * frequency normalization, seasonality detection, and risk assessment.
 */

export interface ExpenseAnalysis {
  totalMonthlyExpenses: Decimal;
  categoryBreakdown: Map<MarketCategory, Decimal>;
  volatilityByCategory: Map<MarketCategory, Decimal>;
  seasonalityFactors: Map<ExpenseCategory, number>;
  fixedVsVariableRatio: number;
  riskScore: number; // 0-1, higher means more volatile expenses
}

export interface ImportedTransaction {
  date: Date;
  amount: Decimal;
  description: string;
  category?: ExpenseCategory;
  isIncome: boolean;
}

export class ExpenseProfiler {
  
  /**
   * Create expense profile from raw transaction data
   */
  createProfileFromTransactions(
    userId: string,
    transactions: ImportedTransaction[],
    riskTolerance: number,
    hedgingBudget: Decimal,
    name: string = 'Default Profile'
  ): ExpenseProfile {
    
    // Filter out income transactions
    const expenses = transactions.filter(t => !t.isIncome && t.amount.gt(0));
    
    // Analyze expense patterns
    const analysis = this.analyzeExpensePatterns(expenses);
    
    // Group transactions into expense items
    const expenseItems = this.groupIntoExpenseItems(expenses, analysis);
    
    return {
      userId,
      name,
      description: `Generated from ${transactions.length} transactions`,
      expenses: expenseItems,
      totalMonthlyExpenses: analysis.totalMonthlyExpenses,
      riskTolerance,
      hedgingBudget,
      rebalanceThreshold: this.calculateRebalanceThreshold(analysis.riskScore),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Update existing profile with new transaction data
   */
  updateProfile(
    profile: ExpenseProfile, 
    newTransactions: ImportedTransaction[]
  ): ExpenseProfile {
    // Combine existing and new data for reanalysis
    const existingTransactions = this.profileToTransactions(profile);
    const allTransactions = [...existingTransactions, ...newTransactions];
    
    return this.createProfileFromTransactions(
      profile.userId,
      allTransactions,
      profile.riskTolerance,
      profile.hedgingBudget,
      profile.name
    );
  }

  /**
   * Analyze expense patterns to extract insights
   */
  analyzeExpensePatterns(transactions: ImportedTransaction[]): ExpenseAnalysis {
    if (transactions.length === 0) {
      throw new Error('No transactions to analyze');
    }

    // Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    const categoryBreakdown = new Map<MarketCategory, Decimal>();
    const volatilityByCategory = new Map<MarketCategory, Decimal>();
    const seasonalityFactors = new Map<ExpenseCategory, number>();
    
    // Calculate monthly expenses by category
    const monthlyByCategory = this.calculateMonthlyExpensesByCategory(transactions);
    
    // Calculate total monthly expenses
    const totalMonthlyExpenses = Array.from(monthlyByCategory.values())
      .reduce((sum, categoryData) => {
        const avgMonthly = this.calculateAverage(categoryData);
        return sum.add(avgMonthly);
      }, new Decimal(0));

    // Calculate category breakdowns and volatilities
    for (const [category, monthlyAmounts] of monthlyByCategory) {
      const marketCategory = EXPENSE_TO_MARKET_CATEGORY[category];
      const avgAmount = this.calculateAverage(monthlyAmounts);
      const volatility = this.calculateVolatility(monthlyAmounts);
      
      // Aggregate by market category
      const currentAmount = categoryBreakdown.get(marketCategory) || new Decimal(0);
      categoryBreakdown.set(marketCategory, currentAmount.add(avgAmount));
      
      // Use highest volatility for market category
      const currentVol = volatilityByCategory.get(marketCategory) || new Decimal(0);
      volatilityByCategory.set(marketCategory, Decimal.max(currentVol, volatility));
      
      // Calculate seasonality
      seasonalityFactors.set(category, this.calculateSeasonality(monthlyAmounts));
    }

    // Calculate fixed vs variable ratio
    const fixedVsVariableRatio = this.calculateFixedVariableRatio(transactions);
    
    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(volatilityByCategory, fixedVsVariableRatio);

    return {
      totalMonthlyExpenses,
      categoryBreakdown,
      volatilityByCategory,
      seasonalityFactors,
      fixedVsVariableRatio,
      riskScore
    };
  }

  /**
   * Predict future expenses based on profile
   */
  predictFutureExpenses(
    profile: ExpenseProfile,
    monthsAhead: number,
    confidenceLevel: number = 0.95
  ): {
    expectedAmount: Decimal;
    lowerBound: Decimal;
    upperBound: Decimal;
    byCategory: Map<MarketCategory, { expected: Decimal; variance: Decimal }>;
  } {
    const byCategory = new Map<MarketCategory, { expected: Decimal; variance: Decimal }>();
    let totalExpected = new Decimal(0);
    let totalVariance = new Decimal(0);

    // Group expenses by market category
    const categorizedExpenses = new Map<MarketCategory, ExpenseItem[]>();
    
    for (const expense of profile.expenses) {
      const marketCategory = EXPENSE_TO_MARKET_CATEGORY[expense.category];
      if (!categorizedExpenses.has(marketCategory)) {
        categorizedExpenses.set(marketCategory, []);
      }
      categorizedExpenses.get(marketCategory)!.push(expense);
    }

    // Calculate predictions by category
    for (const [marketCategory, expenses] of categorizedExpenses) {
      let categoryExpected = new Decimal(0);
      let categoryVariance = new Decimal(0);

      for (const expense of expenses) {
        const monthlyAmount = this.normalizeToMonthly(expense.amount, expense.frequency);
        const projectedAmount = monthlyAmount.mul(monthsAhead);
        
        // Apply seasonality if present
        const seasonalAdjustment = expense.seasonality || 1;
        const adjustedAmount = projectedAmount.mul(seasonalAdjustment);
        
        categoryExpected = categoryExpected.add(adjustedAmount);
        
        // Add variance for variable expenses
        if (!expense.isFixed) {
          const variance = adjustedAmount.mul(0.1).pow(2); // 10% std dev for variable
          categoryVariance = categoryVariance.add(variance);
        }
      }

      byCategory.set(marketCategory, {
        expected: categoryExpected,
        variance: categoryVariance
      });

      totalExpected = totalExpected.add(categoryExpected);
      totalVariance = totalVariance.add(categoryVariance);
    }

    // Calculate confidence intervals
    const stdDev = totalVariance.sqrt();
    const zScore = confidenceLevel === 0.95 ? 1.96 : (confidenceLevel === 0.99 ? 2.576 : 1.645);
    const margin = stdDev.mul(zScore);

    return {
      expectedAmount: totalExpected,
      lowerBound: totalExpected.sub(margin),
      upperBound: totalExpected.add(margin),
      byCategory
    };
  }

  private calculateMonthlyExpensesByCategory(
    transactions: ImportedTransaction[]
  ): Map<ExpenseCategory, Decimal[]> {
    const monthlyData = new Map<string, Map<ExpenseCategory, Decimal>>();
    
    // Group by month and category
    for (const transaction of transactions) {
      const monthKey = `${transaction.date.getFullYear()}-${transaction.date.getMonth()}`;
      const category = transaction.category || 'other';
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, new Map());
      }
      
      const monthData = monthlyData.get(monthKey)!;
      const currentAmount = monthData.get(category) || new Decimal(0);
      monthData.set(category, currentAmount.add(transaction.amount));
    }

    // Convert to arrays of monthly amounts by category
    const result = new Map<ExpenseCategory, Decimal[]>();
    
    for (const monthData of monthlyData.values()) {
      for (const [category, amount] of monthData) {
        if (!result.has(category)) {
          result.set(category, []);
        }
        result.get(category)!.push(amount);
      }
    }

    return result;
  }

  private calculateAverage(values: Decimal[]): Decimal {
    if (values.length === 0) return new Decimal(0);
    
    const sum = values.reduce((acc, val) => acc.add(val), new Decimal(0));
    return sum.div(values.length);
  }

  private calculateVolatility(values: Decimal[]): Decimal {
    if (values.length < 2) return new Decimal(0);
    
    const avg = this.calculateAverage(values);
    const sumSquaredDiffs = values.reduce((acc, val) => {
      const diff = val.sub(avg);
      return acc.add(diff.pow(2));
    }, new Decimal(0));
    
    const variance = sumSquaredDiffs.div(values.length - 1);
    return variance.sqrt();
  }

  private calculateSeasonality(monthlyAmounts: Decimal[]): number {
    if (monthlyAmounts.length < 12) return 1; // Not enough data
    
    const avg = this.calculateAverage(monthlyAmounts);
    const maxVar = monthlyAmounts.reduce((max, amount) => {
      const deviation = amount.sub(avg).abs().div(avg);
      return Decimal.max(max, deviation);
    }, new Decimal(0));
    
    return 1 + maxVar.toNumber() * 0.5; // Cap at 50% seasonal adjustment
  }

  private calculateFixedVariableRatio(transactions: ImportedTransaction[]): number {
    // Simple heuristic: recurring amounts are likely fixed
    const amountFrequency = new Map<string, number>();
    
    for (const transaction of transactions) {
      const amountKey = transaction.amount.toFixed(2);
      amountFrequency.set(amountKey, (amountFrequency.get(amountKey) || 0) + 1);
    }

    let fixedCount = 0;
    for (const frequency of amountFrequency.values()) {
      if (frequency >= 3) { // Appears 3+ times = likely fixed
        fixedCount += frequency;
      }
    }

    return fixedCount / transactions.length;
  }

  private calculateRiskScore(
    volatilityByCategory: Map<MarketCategory, Decimal>,
    fixedVsVariableRatio: number
  ): number {
    // Higher volatility = higher risk
    let avgVolatility = new Decimal(0);
    if (volatilityByCategory.size > 0) {
      const totalVol = Array.from(volatilityByCategory.values())
        .reduce((sum, vol) => sum.add(vol), new Decimal(0));
      avgVolatility = totalVol.div(volatilityByCategory.size);
    }

    // More variable expenses = higher risk
    const variableRatio = 1 - fixedVsVariableRatio;
    
    // Combine factors (0-1 scale)
    const volatilityScore = Math.min(avgVolatility.toNumber(), 1);
    const variabilityScore = variableRatio;
    
    return (volatilityScore * 0.6 + variabilityScore * 0.4);
  }

  private groupIntoExpenseItems(
    transactions: ImportedTransaction[],
    analysis: ExpenseAnalysis
  ): ExpenseItem[] {
    const grouped = new Map<string, ImportedTransaction[]>();
    
    // Group similar transactions
    for (const transaction of transactions) {
      const category = transaction.category || 'other';
      const key = `${category}_${this.normalizeDescription(transaction.description)}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(transaction);
    }

    const expenseItems: ExpenseItem[] = [];
    
    for (const [key, group] of grouped) {
      const category = group[0].category || 'other';
      const avgAmount = this.calculateAverage(group.map(t => t.amount));
      const frequency = this.detectFrequency(group);
      const isFixed = this.isFixedExpense(group);
      const seasonality = analysis.seasonalityFactors.get(category) || 1;
      
      expenseItems.push({
        id: `expense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: this.generateExpenseName(group[0].description, category),
        category,
        amount: avgAmount,
        frequency,
        region: 'us-national', // Default region
        isFixed,
        seasonality: seasonality !== 1 ? seasonality : undefined,
        notes: `Generated from ${group.length} transactions`
      });
    }

    return expenseItems;
  }

  private normalizeToMonthly(amount: Decimal, frequency: ExpenseFrequency): Decimal {
    const multipliers: Record<ExpenseFrequency, number> = {
      daily: 30.44, // Average days per month
      weekly: 4.33, // Average weeks per month
      monthly: 1,
      quarterly: 1/3,
      annually: 1/12,
      'one-time': 0 // One-time expenses don't contribute to monthly
    };

    return amount.mul(multipliers[frequency]);
  }

  private detectFrequency(transactions: ImportedTransaction[]): ExpenseFrequency {
    if (transactions.length === 1) return 'one-time';
    
    // Calculate average days between transactions
    const sortedDates = transactions
      .map(t => t.date.getTime())
      .sort((a, b) => a - b);
    
    let totalDaysBetween = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      totalDaysBetween += (sortedDates[i] - sortedDates[i-1]) / (24 * 60 * 60 * 1000);
    }
    
    const avgDaysBetween = totalDaysBetween / (sortedDates.length - 1);
    
    // Classify frequency based on average interval
    if (avgDaysBetween <= 2) return 'daily';
    if (avgDaysBetween <= 10) return 'weekly';
    if (avgDaysBetween <= 40) return 'monthly';
    if (avgDaysBetween <= 120) return 'quarterly';
    return 'annually';
  }

  private isFixedExpense(transactions: ImportedTransaction[]): boolean {
    if (transactions.length < 2) return false;
    
    const amounts = transactions.map(t => t.amount);
    const avgAmount = this.calculateAverage(amounts);
    const volatility = this.calculateVolatility(amounts);
    
    // Consider fixed if volatility is less than 5% of average
    return volatility.div(avgAmount).lt(0.05);
  }

  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/\d+/g, '') // Remove numbers
      .replace(/[^a-z\s]/g, '') // Remove special chars
      .trim()
      .substring(0, 20); // Limit length
  }

  private generateExpenseName(description: string, category: ExpenseCategory): string {
    const categoryNames: Record<ExpenseCategory, string> = {
      groceries: 'Groceries',
      dining_out: 'Dining Out',
      beverages: 'Beverages',
      specialty_food: 'Specialty Food',
      rent: 'Rent',
      mortgage: 'Mortgage',
      utilities: 'Utilities',
      home_insurance: 'Home Insurance',
      property_tax: 'Property Tax',
      maintenance: 'Home Maintenance',
      fuel: 'Fuel',
      vehicle_insurance: 'Vehicle Insurance',
      public_transit: 'Public Transit',
      vehicle_maintenance: 'Vehicle Maintenance',
      parking: 'Parking',
      health_insurance: 'Health Insurance',
      medications: 'Medications',
      dental: 'Dental Care',
      vision: 'Vision Care',
      mental_health: 'Mental Health',
      electricity: 'Electricity',
      gas: 'Gas',
      heating_oil: 'Heating Oil',
      renewable_energy: 'Renewable Energy',
      internet: 'Internet',
      mobile: 'Mobile Phone',
      software_subscriptions: 'Software Subscriptions',
      devices: 'Tech Devices',
      clothing: 'Clothing',
      household_goods: 'Household Goods',
      personal_care: 'Personal Care',
      other: 'Other Expenses'
    };

    return categoryNames[category] || 'Unknown Expense';
  }

  private calculateRebalanceThreshold(riskScore: number): number {
    // Higher risk = lower threshold = more frequent rebalancing
    return Math.max(0.05, 0.3 - (riskScore * 0.2));
  }

  private profileToTransactions(profile: ExpenseProfile): ImportedTransaction[] {
    // Convert profile back to transaction format for reanalysis
    // This is a simplified conversion - in practice would need more sophisticated logic
    return profile.expenses.flatMap(expense => {
      const monthlyAmount = this.normalizeToMonthly(expense.amount, expense.frequency);
      // Generate representative transactions for the past 12 months
      const transactions: ImportedTransaction[] = [];
      
      for (let i = 0; i < 12; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        
        transactions.push({
          date,
          amount: monthlyAmount,
          description: expense.name,
          category: expense.category,
          isIncome: false
        });
      }
      
      return transactions;
    });
  }
}