import { CacheStore } from './cacheStore';
import { CacheKeyGenerator } from './cacheKeyGenerator';
import { ICollectionQuery } from '../types';

export enum InvalidationStrategy {
  TTL = 'ttl',
  LRU = 'lru',
  Manual = 'manual',
  Smart = 'smart'
}

export interface InvalidationRule {
  strategy: InvalidationStrategy;
  pattern?: string;
  ttlSeconds?: number;
  maxAge?: number;
  dependencies?: string[];
}

export interface InvalidationOptions<T = unknown> {
  collection: string;
  operation: 'create' | 'update' | 'delete' | 'batchCreate' | 'batchUpdate' | 'batchDelete';
  ids?: string[];
  query?: ICollectionQuery;
  data?: T;
}

export class CacheInvalidator<T = unknown> {
  private rules: Map<string, InvalidationRule[]>;
  private dependencies: Map<string, Set<string>>;
  
  constructor(private cache: CacheStore<T>) {
    this.rules = new Map();
    this.dependencies = new Map();
  }
  
  addRule(pattern: string, rule: InvalidationRule): void {
    const rules = this.rules.get(pattern) || [];
    rules.push(rule);
    this.rules.set(pattern, rules);
    
    if (rule.dependencies) {
      for (const dep of rule.dependencies) {
        const deps = this.dependencies.get(dep) || new Set();
        deps.add(pattern);
        this.dependencies.set(dep, deps);
      }
    }
  }
  
  async invalidate(options: InvalidationOptions<T>): Promise<void> {
    const affectedKeys = await this.findAffectedKeys(options);
    
    for (const key of affectedKeys) {
      await this.cache.delete(key);
    }
    
    await this.invalidateDependencies(options);
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.cache.keys();
    const regex = this.patternToRegex(pattern);
    
    for (const key of keys) {
      if (regex.test(key)) {
        await this.cache.delete(key);
      }
    }
  }
  
  async invalidateCollection(collection: string): Promise<void> {
    const pattern = CacheKeyGenerator.generatePattern(collection);
    await this.invalidatePattern(pattern);
  }
  
  async invalidateOperation(collection: string, operation: string): Promise<void> {
    const pattern = CacheKeyGenerator.generatePattern(collection, operation);
    await this.invalidatePattern(pattern);
  }
  
  async smartInvalidate(options: InvalidationOptions<T>): Promise<void> {
    switch (options.operation) {
      case 'create':
      case 'batchCreate':
        await this.invalidateListQueries(options.collection);
        await this.invalidateCountQueries(options.collection);
        break;
        
      case 'update':
        if (options.ids && options.ids.length > 0) {
          await this.invalidateByIds(options.collection, options.ids);
        }
        await this.invalidateRelatedQueries(options);
        break;
        
      case 'batchUpdate':
        if (options.query) {
          await this.invalidateByQuery(options.collection, options.query);
        } else if (options.ids && options.ids.length > 0) {
          await this.invalidateByIds(options.collection, options.ids);
        }
        await this.invalidateListQueries(options.collection);
        break;
        
      case 'delete':
      case 'batchDelete':
        if (options.ids && options.ids.length > 0) {
          await this.invalidateByIds(options.collection, options.ids);
        }
        await this.invalidateListQueries(options.collection);
        await this.invalidateCountQueries(options.collection);
        break;
    }
  }
  
  private async findAffectedKeys(options: InvalidationOptions<T>): Promise<string[]> {
    const keys = await this.cache.keys();
    const affected: string[] = [];
    
    for (const key of keys) {
      if (this.isKeyAffected(key, options)) {
        affected.push(key);
      }
    }
    
    return affected;
  }
  
  private isKeyAffected(key: string, options: InvalidationOptions<T>): boolean {
    if (!CacheKeyGenerator.isFlongoKey(key)) {
      return false;
    }
    
    const collection = CacheKeyGenerator.getCollectionFromKey(key);
    if (collection !== options.collection) {
      return false;
    }
    
    const operation = CacheKeyGenerator.getOperationFromKey(key);
    
    switch (options.operation) {
      case 'create':
      case 'batchCreate':
        return operation === 'getAll' || 
               operation === 'getSome' || 
               operation === 'count' ||
               operation === 'exists';
        
      case 'update':
      case 'batchUpdate':
        return true;
        
      case 'delete':
      case 'batchDelete':
        return true;
        
      default:
        return false;
    }
  }
  
  private async invalidateByIds(collection: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      const key = CacheKeyGenerator.generate({
        collection,
        operation: 'get',
        id
      });
      await this.cache.delete(key);
    }
  }
  
  private async invalidateByQuery(collection: string, query: ICollectionQuery): Promise<void> {
    const keys = await this.cache.keys();
    
    for (const key of keys) {
      if (CacheKeyGenerator.getCollectionFromKey(key) === collection) {
        await this.cache.delete(key);
      }
    }
  }
  
  private async invalidateListQueries(collection: string): Promise<void> {
    const operations = ['getAll', 'getSome', 'getFirst'];
    
    for (const op of operations) {
      await this.invalidateOperation(collection, op);
    }
  }
  
  private async invalidateCountQueries(collection: string): Promise<void> {
    await this.invalidateOperation(collection, 'count');
    await this.invalidateOperation(collection, 'exists');
  }
  
  private async invalidateRelatedQueries(options: InvalidationOptions<T>): Promise<void> {
    if (!options.data) {
      // If no data provided, invalidate all list queries for safety
      await this.invalidateListQueries(options.collection);
      return;
    }
    
    const keys = await this.cache.keys();
    const changedFields = Object.keys(options.data);
    
    for (const key of keys) {
      if (CacheKeyGenerator.getCollectionFromKey(key) === options.collection) {
        const operation = CacheKeyGenerator.getOperationFromKey(key);
        
        // Only invalidate list queries since individual item queries are handled by invalidateByIds
        if (operation === 'getAll' || 
            operation === 'getSome' || 
            operation === 'getFirst') {
          await this.cache.delete(key);
        }
      }
    }
  }
  
  private async invalidateDependencies(options: InvalidationOptions<T>): Promise<void> {
    const pattern = `${options.collection}:*`;
    const dependentPatterns = this.dependencies.get(pattern) || new Set();
    
    for (const depPattern of dependentPatterns) {
      await this.invalidatePattern(depPattern);
    }
  }
  
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    
    return new RegExp(`^${escaped}$`);
  }
}

export class TTLStrategy {
  private defaultTTL: number;
  private customTTLs: Map<string, number>;
  
  constructor(defaultTTLSeconds: number = 300) {
    this.defaultTTL = defaultTTLSeconds;
    this.customTTLs = new Map();
  }
  
  setTTL(pattern: string, ttlSeconds: number): void {
    this.customTTLs.set(pattern, ttlSeconds);
  }
  
  getTTL(key: string): number {
    for (const [pattern, ttl] of this.customTTLs.entries()) {
      const regex = this.patternToRegex(pattern);
      if (regex.test(key)) {
        return ttl;
      }
    }
    
    return this.defaultTTL;
  }
  
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    
    return new RegExp(`^${escaped}$`);
  }
}

export class LRUStrategy {
  private maxEntries: number;
  private maxMemoryMB: number;
  
  constructor(maxEntries: number = 10000, maxMemoryMB: number = 100) {
    this.maxEntries = maxEntries;
    this.maxMemoryMB = maxMemoryMB;
  }
  
  getMaxEntries(): number {
    return this.maxEntries;
  }
  
  getMaxMemoryMB(): number {
    return this.maxMemoryMB;
  }
  
  setMaxEntries(max: number): void {
    this.maxEntries = max;
  }
  
  setMaxMemoryMB(max: number): void {
    this.maxMemoryMB = max;
  }
}