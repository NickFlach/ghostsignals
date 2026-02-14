import csv from 'csv-parser';
import { createReadStream } from 'fs';
import Decimal from 'decimal.js';
import { ExpenseProfiler, ImportedTransaction, ExpenseCategory } from '@ghostsignals/hedge-engine';

/**
 * Local Expense Profiler - Privacy-first transaction processing
 * 
 * This package provides tools for importing and categorizing expense data
 * from various sources while keeping all processing local to the device.
 */

export interface CSVTransaction {
  date: string;
  amount: string;
  description: string;
  category?: string;
  type?: string;
}

export interface ReceiptData {
  merchant: string;
  amount: number;
  date: Date;
  items: Array<{
    name: string;
    amount: number;
    category?: string;
  }>;
}

export class LocalExpenseProfiler extends ExpenseProfiler {
  
  /**
   * Import transactions from CSV file
   */
  async importFromCSV(filePath: string): Promise<ImportedTransaction[]> {
    const transactions: ImportedTransaction[] = [];
    
    return new Promise((resolve, reject) => {
      createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: CSVTransaction) => {
          try {
            const transaction = this.parseCSVRow(row);
            if (transaction) {
              transactions.push(transaction);
            }
          } catch (error) {
            console.warn(`Failed to parse row:`, row, error);
          }
        })
        .on('end', () => {
          resolve(transactions);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Categorize expense description using local ML model
   */
  categorizeExpense(description: string): ExpenseCategory {
    // Simplified categorization logic
    // In practice, would use ghostvector WASM for embedding-based classification
    
    const desc = description.toLowerCase();
    
    // Food categories
    if (desc.includes('grocery') || desc.includes('supermarket') || desc.includes('food')) {
      return 'groceries';
    }
    if (desc.includes('restaurant') || desc.includes('cafe') || desc.includes('dining')) {
      return 'dining_out';
    }
    
    // Housing categories
    if (desc.includes('rent') || desc.includes('lease')) {
      return 'rent';
    }
    if (desc.includes('mortgage') || desc.includes('home loan')) {
      return 'mortgage';
    }
    if (desc.includes('electric') || desc.includes('power') || desc.includes('utility')) {
      return 'electricity';
    }
    if (desc.includes('gas') && !desc.includes('gasoline')) {
      return 'gas';
    }
    if (desc.includes('water') || desc.includes('sewer') || desc.includes('utility')) {
      return 'utilities';
    }
    
    // Transportation
    if (desc.includes('gas station') || desc.includes('fuel') || desc.includes('gasoline')) {
      return 'fuel';
    }
    if (desc.includes('car insurance') || desc.includes('auto insurance')) {
      return 'vehicle_insurance';
    }
    if (desc.includes('metro') || desc.includes('bus') || desc.includes('transit')) {
      return 'public_transit';
    }
    
    // Healthcare
    if (desc.includes('pharmacy') || desc.includes('medication') || desc.includes('drug')) {
      return 'medications';
    }
    if (desc.includes('doctor') || desc.includes('medical') || desc.includes('hospital')) {
      return 'health_insurance'; // Simplified
    }
    if (desc.includes('dental') || desc.includes('dentist')) {
      return 'dental';
    }
    
    // Technology
    if (desc.includes('internet') || desc.includes('wifi') || desc.includes('broadband')) {
      return 'internet';
    }
    if (desc.includes('phone') || desc.includes('mobile') || desc.includes('cellular')) {
      return 'mobile';
    }
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('subscription')) {
      return 'software_subscriptions';
    }
    
    // Materials
    if (desc.includes('clothing') || desc.includes('apparel') || desc.includes('fashion')) {
      return 'clothing';
    }
    if (desc.includes('amazon') || desc.includes('walmart') || desc.includes('target')) {
      return 'household_goods';
    }
    
    // Default category
    return 'other';
  }

  /**
   * Process receipt data from image or PDF
   */
  async processReceipt(receiptData: ReceiptData): Promise<ImportedTransaction[]> {
    const transactions: ImportedTransaction[] = [];
    
    // Create transaction for total amount
    transactions.push({
      date: receiptData.date,
      amount: new Decimal(receiptData.amount),
      description: `${receiptData.merchant} - Receipt`,
      category: this.categorizeMerchant(receiptData.merchant),
      isIncome: false
    });
    
    // Optionally create separate transactions for itemized items
    if (receiptData.items.length > 1) {
      for (const item of receiptData.items) {
        transactions.push({
          date: receiptData.date,
          amount: new Decimal(item.amount),
          description: `${receiptData.merchant} - ${item.name}`,
          category: item.category as ExpenseCategory || this.categorizeExpense(item.name),
          isIncome: false
        });
      }
    }
    
    return transactions;
  }

  /**
   * Detect recurring transactions and their frequency
   */
  detectRecurringTransactions(transactions: ImportedTransaction[]): {
    recurring: ImportedTransaction[][];
    oneTime: ImportedTransaction[];
  } {
    const recurring: ImportedTransaction[][] = [];
    const oneTime: ImportedTransaction[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < transactions.length; i++) {
      if (processed.has(i)) continue;
      
      const transaction = transactions[i];
      const similar: ImportedTransaction[] = [transaction];
      processed.add(i);
      
      // Find similar transactions (same amount and similar description)
      for (let j = i + 1; j < transactions.length; j++) {
        if (processed.has(j)) continue;
        
        const other = transactions[j];
        if (this.areTransactionsSimilar(transaction, other)) {
          similar.push(other);
          processed.add(j);
        }
      }
      
      // If we found multiple similar transactions, they might be recurring
      if (similar.length >= 2) {
        recurring.push(similar);
      } else {
        oneTime.push(transaction);
      }
    }
    
    return { recurring, oneTime };
  }

  /**
   * Generate expense forecast based on historical patterns
   */
  generateExpenseForecast(
    transactions: ImportedTransaction[],
    monthsAhead: number = 12
  ): {
    monthlyForecast: Array<{
      month: Date;
      expectedAmount: Decimal;
      categories: Map<ExpenseCategory, Decimal>;
    }>;
    confidence: number;
  } {
    const { recurring } = this.detectRecurringTransactions(transactions);
    const forecast: Array<{
      month: Date;
      expectedAmount: Decimal;
      categories: Map<ExpenseCategory, Decimal>;
    }> = [];
    
    for (let i = 0; i < monthsAhead; i++) {
      const month = new Date();
      month.setMonth(month.getMonth() + i);
      
      let monthlyTotal = new Decimal(0);
      const categoryTotals = new Map<ExpenseCategory, Decimal>();
      
      // Add recurring expenses
      for (const series of recurring) {
        const avgAmount = this.calculateAverage(series.map(t => t.amount));
        const category = series[0].category || 'other';
        
        monthlyTotal = monthlyTotal.add(avgAmount);
        const categoryTotal = categoryTotals.get(category) || new Decimal(0);
        categoryTotals.set(category, categoryTotal.add(avgAmount));
      }
      
      forecast.push({
        month,
        expectedAmount: monthlyTotal,
        categories: categoryTotals
      });
    }
    
    return {
      monthlyForecast: forecast,
      confidence: Math.min(0.95, 0.5 + (recurring.length * 0.05)) // Higher confidence with more recurring patterns
    };
  }

  private parseCSVRow(row: CSVTransaction): ImportedTransaction | null {
    try {
      const date = new Date(row.date);
      const amount = new Decimal(row.amount.replace(/[$,]/g, ''));
      
      // Skip if amount is zero or negative (unless it's income)
      const isIncome = row.type?.toLowerCase().includes('credit') || 
                      row.type?.toLowerCase().includes('deposit') ||
                      amount.lt(0);
      
      return {
        date,
        amount: amount.abs(),
        description: row.description,
        category: row.category as ExpenseCategory || this.categorizeExpense(row.description),
        isIncome
      };
    } catch (error) {
      return null;
    }
  }

  private categorizeMerchant(merchant: string): ExpenseCategory {
    const merchantLower = merchant.toLowerCase();
    
    // Common merchant patterns
    if (merchantLower.includes('walmart') || merchantLower.includes('target') || 
        merchantLower.includes('costco') || merchantLower.includes('kroger')) {
      return 'groceries';
    }
    
    if (merchantLower.includes('shell') || merchantLower.includes('exxon') || 
        merchantLower.includes('chevron') || merchantLower.includes('bp')) {
      return 'fuel';
    }
    
    if (merchantLower.includes('mcdonalds') || merchantLower.includes('burger') || 
        merchantLower.includes('pizza') || merchantLower.includes('restaurant')) {
      return 'dining_out';
    }
    
    return this.categorizeExpense(merchant);
  }

  private areTransactionsSimilar(t1: ImportedTransaction, t2: ImportedTransaction): boolean {
    // Same amount (within 5%)
    const amountDiff = t1.amount.sub(t2.amount).abs().div(t1.amount);
    if (amountDiff.gt(0.05)) return false;
    
    // Similar description (simple string similarity)
    const desc1 = t1.description.toLowerCase().replace(/\d+/g, '').trim();
    const desc2 = t2.description.toLowerCase().replace(/\d+/g, '').trim();
    
    return desc1 === desc2 || this.calculateStringSimilarity(desc1, desc2) > 0.8;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private calculateAverage(amounts: Decimal[]): Decimal {
    if (amounts.length === 0) return new Decimal(0);
    
    const sum = amounts.reduce((acc, amount) => acc.add(amount), new Decimal(0));
    return sum.div(amounts.length);
  }
}

export { ExpenseCategory, ExpenseProfiler, ImportedTransaction } from '@ghostsignals/hedge-engine';