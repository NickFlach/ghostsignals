import { CategoryNode, CategoryNodeSchema } from './schemas.js';
import { MarketCategory } from '@ghostsignals/core';
import Decimal from 'decimal.js';

/**
 * Category Taxonomy - Hierarchical organization of price categories
 * 
 * This defines the tree structure for price categories, from high-level
 * market categories down to specific goods and services.
 * Maps to the ghostsignals market categories for hedging integration.
 */

export class CategoryTaxonomy {
  private nodes = new Map<string, CategoryNode>();
  private rootNodes = new Set<string>();
  private leafNodes = new Set<string>();

  constructor() {
    this.initializeDefaultTaxonomy();
  }

  /**
   * Get a category node by ID
   */
  getCategory(categoryId: string): CategoryNode | undefined {
    return this.nodes.get(categoryId);
  }

  /**
   * Get all root categories
   */
  getRootCategories(): CategoryNode[] {
    return Array.from(this.rootNodes).map(id => this.nodes.get(id)!);
  }

  /**
   * Get children of a category
   */
  getChildren(categoryId: string): CategoryNode[] {
    const category = this.nodes.get(categoryId);
    if (!category) return [];
    
    return category.children.map(childId => this.nodes.get(childId)!).filter(Boolean);
  }

  /**
   * Get all leaf categories (actual price categories)
   */
  getLeafCategories(): CategoryNode[] {
    return Array.from(this.leafNodes).map(id => this.nodes.get(id)!);
  }

  /**
   * Get category path from root to node
   */
  getCategoryPath(categoryId: string): CategoryNode[] {
    const path: CategoryNode[] = [];
    let currentId: string | undefined = categoryId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      
      path.unshift(node);
      currentId = node.parentId;
    }

    return path;
  }

  /**
   * Find categories by market category
   */
  getCategoriesByMarketCategory(marketCategory: MarketCategory): CategoryNode[] {
    return Array.from(this.nodes.values()).filter(
      node => node.marketCategory === marketCategory
    );
  }

  /**
   * Search categories by name or description
   */
  searchCategories(query: string): CategoryNode[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(node =>
      node.name.toLowerCase().includes(lowerQuery) ||
      (node.description && node.description.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Add a new category to the taxonomy
   */
  addCategory(input: Omit<CategoryNode, 'weight'> & { weight?: Decimal }): void {
    const category = CategoryNodeSchema.parse({ weight: new Decimal(1), ...input }) as CategoryNode;
    // Validate parent exists if specified
    if (category.parentId && !this.nodes.has(category.parentId)) {
      throw new Error(`Parent category ${category.parentId} not found`);
    }

    // Update parent's children list
    if (category.parentId) {
      const parent = this.nodes.get(category.parentId)!;
      if (!parent.children.includes(category.id)) {
        parent.children.push(category.id);
        parent.isLeaf = false;
      }
    } else {
      this.rootNodes.add(category.id);
    }

    // Update leaf status
    if (category.isLeaf) {
      this.leafNodes.add(category.id);
    }

    this.nodes.set(category.id, category);
  }

  /**
   * Remove a category from the taxonomy
   */
  removeCategory(categoryId: string): boolean {
    const category = this.nodes.get(categoryId);
    if (!category) return false;

    // Can't remove category with children
    if (category.children.length > 0) {
      throw new Error('Cannot remove category with children');
    }

    // Remove from parent's children
    if (category.parentId) {
      const parent = this.nodes.get(category.parentId)!;
      parent.children = parent.children.filter(id => id !== categoryId);
      if (parent.children.length === 0) {
        parent.isLeaf = true;
        this.leafNodes.add(parent.id);
      }
    }

    // Clean up references
    this.nodes.delete(categoryId);
    this.rootNodes.delete(categoryId);
    this.leafNodes.delete(categoryId);

    return true;
  }

  /**
   * Calculate composite weight for a category in an index
   */
  calculateCompositeWeight(categoryId: string, indexComponents: Map<string, Decimal>): Decimal {
    const category = this.nodes.get(categoryId);
    if (!category) return new Decimal(0);

    // Direct weight if specified
    const directWeight = indexComponents.get(categoryId);
    if (directWeight) return directWeight;

    // Aggregate from children
    let totalWeight = new Decimal(0);
    for (const childId of category.children) {
      const childWeight = this.calculateCompositeWeight(childId, indexComponents);
      totalWeight = totalWeight.add(childWeight);
    }

    return totalWeight;
  }

  /**
   * Get similar categories based on taxonomy distance
   */
  getSimilarCategories(categoryId: string, maxDistance: number = 2): CategoryNode[] {
    const category = this.nodes.get(categoryId);
    if (!category) return [];

    const similar: CategoryNode[] = [];
    const visited = new Set<string>();

    this.findSimilarRecursive(category, 0, maxDistance, similar, visited);

    return similar.filter(node => node.id !== categoryId);
  }

  /**
   * Validate taxonomy consistency
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for orphaned nodes
    for (const [id, node] of this.nodes) {
      if (node.parentId && !this.nodes.has(node.parentId)) {
        errors.push(`Category ${id} has invalid parent ${node.parentId}`);
      }
    }

    // Check for circular references
    for (const [id] of this.nodes) {
      if (this.hasCircularReference(id, new Set())) {
        errors.push(`Category ${id} has circular reference`);
      }
    }

    // Check leaf node consistency
    for (const leafId of this.leafNodes) {
      const node = this.nodes.get(leafId);
      if (node && node.children.length > 0) {
        errors.push(`Leaf category ${leafId} has children`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private initializeDefaultTaxonomy(): void {
    // Food taxonomy
    this.addCategory({
      id: 'food',
      name: 'Food & Beverages',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'food',
      description: 'All food and beverage items'
    });

    this.addCategory({
      id: 'food.grains',
      name: 'Grains & Cereals',
      parentId: 'food',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per bushel',
      description: 'Wheat, corn, rice, oats, etc.'
    });

    this.addCategory({
      id: 'food.grains.wheat',
      name: 'Wheat',
      parentId: 'food.grains',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per bushel',
      description: 'All wheat varieties'
    });

    this.addCategory({
      id: 'food.grains.corn',
      name: 'Corn',
      parentId: 'food.grains',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per bushel'
    });

    this.addCategory({
      id: 'food.proteins',
      name: 'Proteins',
      parentId: 'food',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per lb'
    });

    this.addCategory({
      id: 'food.proteins.beef',
      name: 'Beef',
      parentId: 'food.proteins',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per lb'
    });

    this.addCategory({
      id: 'food.dairy',
      name: 'Dairy Products',
      parentId: 'food',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per gallon'
    });

    this.addCategory({
      id: 'food.dairy.milk',
      name: 'Milk',
      parentId: 'food.dairy',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per gallon'
    });

    // Housing taxonomy
    this.addCategory({
      id: 'housing',
      name: 'Housing & Shelter',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'housing'
    });

    this.addCategory({
      id: 'housing.rent',
      name: 'Rental Costs',
      parentId: 'housing',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per month'
    });

    this.addCategory({
      id: 'housing.rent.apartment',
      name: 'Apartment Rent',
      parentId: 'housing.rent',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per month per sqft'
    });

    this.addCategory({
      id: 'housing.utilities',
      name: 'Utilities',
      parentId: 'housing',
      level: 1,
      children: [],
      isLeaf: false
    });

    this.addCategory({
      id: 'housing.utilities.electricity',
      name: 'Electricity',
      parentId: 'housing.utilities',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per kWh',
      marketCategory: 'energy'
    });

    // Energy taxonomy
    this.addCategory({
      id: 'energy',
      name: 'Energy',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'energy'
    });

    this.addCategory({
      id: 'energy.petroleum',
      name: 'Petroleum Products',
      parentId: 'energy',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per gallon'
    });

    this.addCategory({
      id: 'energy.petroleum.gasoline',
      name: 'Gasoline',
      parentId: 'energy.petroleum',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per gallon'
    });

    // Healthcare taxonomy
    this.addCategory({
      id: 'healthcare',
      name: 'Healthcare',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'healthcare'
    });

    this.addCategory({
      id: 'healthcare.services',
      name: 'Medical Services',
      parentId: 'healthcare',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per visit'
    });

    this.addCategory({
      id: 'healthcare.pharmaceuticals',
      name: 'Pharmaceuticals',
      parentId: 'healthcare',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per prescription'
    });

    // Transport taxonomy
    this.addCategory({
      id: 'transport',
      name: 'Transportation',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'transport'
    });

    this.addCategory({
      id: 'transport.fuel',
      name: 'Transportation Fuel',
      parentId: 'transport',
      level: 1,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per gallon'
    });

    // Tech taxonomy
    this.addCategory({
      id: 'tech',
      name: 'Technology',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'tech'
    });

    this.addCategory({
      id: 'tech.devices',
      name: 'Electronic Devices',
      parentId: 'tech',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per unit'
    });

    // Materials taxonomy
    this.addCategory({
      id: 'materials',
      name: 'Materials & Goods',
      level: 0,
      children: [],
      isLeaf: false,
      marketCategory: 'materials'
    });

    this.addCategory({
      id: 'materials.metals',
      name: 'Metals',
      parentId: 'materials',
      level: 1,
      children: [],
      isLeaf: false,
      unitOfMeasure: 'USD per ounce'
    });

    this.addCategory({
      id: 'materials.metals.gold',
      name: 'Gold',
      parentId: 'materials.metals',
      level: 2,
      children: [],
      isLeaf: true,
      unitOfMeasure: 'USD per ounce'
    });
  }

  private findSimilarRecursive(
    category: CategoryNode,
    currentDistance: number,
    maxDistance: number,
    similar: CategoryNode[],
    visited: Set<string>
  ): void {
    if (currentDistance > maxDistance || visited.has(category.id)) return;

    visited.add(category.id);
    similar.push(category);

    // Check parent
    if (category.parentId && currentDistance < maxDistance) {
      const parent = this.nodes.get(category.parentId);
      if (parent) {
        this.findSimilarRecursive(parent, currentDistance + 1, maxDistance, similar, visited);
      }
    }

    // Check children
    if (currentDistance < maxDistance) {
      for (const childId of category.children) {
        const child = this.nodes.get(childId);
        if (child) {
          this.findSimilarRecursive(child, currentDistance + 1, maxDistance, similar, visited);
        }
      }
    }

    // Check siblings
    if (category.parentId && currentDistance < maxDistance) {
      const parent = this.nodes.get(category.parentId);
      if (parent) {
        for (const siblingId of parent.children) {
          if (siblingId !== category.id) {
            const sibling = this.nodes.get(siblingId);
            if (sibling) {
              this.findSimilarRecursive(sibling, currentDistance + 1, maxDistance, similar, visited);
            }
          }
        }
      }
    }
  }

  private hasCircularReference(categoryId: string, visited: Set<string>): boolean {
    if (visited.has(categoryId)) return true;

    const category = this.nodes.get(categoryId);
    if (!category || !category.parentId) return false;

    visited.add(categoryId);
    return this.hasCircularReference(category.parentId, visited);
  }
}