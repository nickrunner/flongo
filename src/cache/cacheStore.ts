export interface CacheEntry<T = any> {
  value: T;
  ttl?: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sets: number;
  deletes: number;
  clears: number;
  size: number;
  memoryUsage?: number;
}

export interface CacheStore<T = any> {
  get(key: string): Promise<T | undefined>;
  
  set(key: string, value: T, ttlSeconds?: number): Promise<void>;
  
  delete(key: string): Promise<boolean>;
  
  clear(): Promise<void>;
  
  has(key: string): Promise<boolean>;
  
  size(): Promise<number>;
  
  keys(): Promise<string[]>;
  
  getStats(): Promise<CacheStats>;
  
  resetStats(): Promise<void>;
}

export interface CacheStoreOptions {
  maxEntries?: number;
  defaultTTL?: number;
  enableStats?: boolean;
  onEviction?: (key: string, value: any) => void;
}

export abstract class BaseCacheStore<T = any> implements CacheStore<T> {
  protected stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
    deletes: 0,
    clears: 0,
    size: 0,
    memoryUsage: 0
  };
  
  protected options: Required<CacheStoreOptions>;
  
  constructor(options: CacheStoreOptions = {}) {
    this.options = {
      maxEntries: options.maxEntries ?? 10000,
      defaultTTL: options.defaultTTL ?? 300,
      enableStats: options.enableStats ?? true,
      onEviction: options.onEviction ?? (() => {})
    };
  }
  
  abstract get(key: string): Promise<T | undefined>;
  abstract set(key: string, value: T, ttlSeconds?: number): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract has(key: string): Promise<boolean>;
  abstract size(): Promise<number>;
  abstract keys(): Promise<string[]>;
  
  async getStats(): Promise<CacheStats> {
    if (!this.options.enableStats) {
      return {
        hits: 0,
        misses: 0,
        evictions: 0,
        sets: 0,
        deletes: 0,
        clears: 0,
        size: await this.size(),
        memoryUsage: 0
      };
    }
    return { ...this.stats, size: await this.size() };
  }
  
  async resetStats(): Promise<void> {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      size: 0,
      memoryUsage: 0
    };
  }
  
  protected incrementStat(stat: keyof CacheStats, amount: number = 1): void {
    if (this.options.enableStats && typeof this.stats[stat] === 'number') {
      (this.stats[stat] as number) += amount;
    }
  }
}