import { FlongoCollection, FlongoCollectionOptions } from "./flongoCollection";
import { FlongoQuery } from "./flongoQuery";
import { Entity, Pagination, Repository } from "./types";
import { 
  CacheStore, 
  MemoryCache, 
  CacheKeyGenerator, 
  CacheKeyOptions,
  CacheConfiguration,
  createDefaultConfig
} from "./cache";

export interface CachedFlongoCollectionOptions extends FlongoCollectionOptions {
  /** Whether to enable caching (defaults to true) */
  enableCaching?: boolean;
  /** Cache configuration */
  cacheConfig?: CacheConfiguration;
  /** Custom cache store implementation */
  cacheStore?: CacheStore<unknown>;
  /** Whether to enable cache monitoring */
  enableMonitoring?: boolean;
  /** Cache warmup data - array of queries to preload */
  warmupQueries?: Array<{
    query?: FlongoQuery;
    pagination?: Pagination;
  }>;
  /** Cache bypass predicate - return true to bypass cache for a specific operation/query */
  bypassCache?: (operation: string, query?: FlongoQuery) => boolean;
}

/**
 * CachedFlongoCollection extends FlongoCollection with transparent caching layer.
 * Provides read-through caching for all read operations while maintaining
 * full API compatibility with FlongoCollection.
 * 
 * Features:
 * - Transparent caching for get(), getAll(), getSome(), getFirst(), count(), exists()
 * - Intelligent cache key generation from FlongoQuery objects
 * - Configurable cache behavior per collection
 * - Query result normalization for consistent caching
 * - Cache warmup capabilities
 * - Cache bypass mechanism
 * - Cache-aware pagination
 * 
 * Example usage:
 * ```typescript
 * const users = new CachedFlongoCollection<User>('users', {
 *   enableCaching: true,
 *   cacheConfig: new CacheConfiguration({
 *     defaultTTL: 300,
 *     maxEntries: 10000
 *   }),
 *   warmupQueries: [
 *     { query: new FlongoQuery().where('status').eq('active') }
 *   ]
 * });
 * ```
 */
export class CachedFlongoCollection<T> extends FlongoCollection<T> {
  private cache: CacheStore<unknown>;
  private cacheConfig: CacheConfiguration;
  private collectionName: Repository;
  private bypassPredicate?: (operation: string, query?: FlongoQuery) => boolean;
  private cachingEnabled: boolean;

  constructor(collectionName: Repository, options: CachedFlongoCollectionOptions = {}) {
    super(collectionName, options);
    
    this.collectionName = collectionName;
    this.cachingEnabled = options.enableCaching !== false;
    this.bypassPredicate = options.bypassCache;
    
    // Initialize cache configuration
    this.cacheConfig = options.cacheConfig || new CacheConfiguration(createDefaultConfig());
    
    // Initialize cache store
    this.cache = options.cacheStore || new MemoryCache({
      maxEntries: this.cacheConfig.maxEntries,
      defaultTTL: this.cacheConfig.defaultTTL,
      enableStats: this.cacheConfig.enableStats
    });
    
    // Monitoring is handled through cache store stats
    
    // Store warmup queries for manual warmup if needed
    // Don't perform automatic warmup in constructor to avoid side effects
    // Call warmupCache() manually after construction if needed
  }

  /**
   * Checks if caching should be bypassed for the given operation
   */
  private shouldBypassCache(operation: string, query?: FlongoQuery): boolean {
    if (!this.cachingEnabled) {
      return true;
    }
    
    if (this.bypassPredicate) {
      return this.bypassPredicate(operation, query);
    }
    
    return false;
  }

  /**
   * Generates a cache key for the given operation and parameters
   */
  private generateCacheKey(
    operation: string, 
    id?: string, 
    query?: FlongoQuery, 
    pagination?: Pagination,
    additionalParams?: Record<string, unknown>
  ): string {
    const options: CacheKeyOptions = {
      collection: this.collectionName,
      operation,
      id,
      query,
      pagination,
      additionalParams
    };
    
    return CacheKeyGenerator.generate(options);
  }

  /**
   * Records cache hit/miss metrics if monitoring is enabled
   */
  private recordCacheMetrics(hit: boolean, operation: string) {
    // Monitoring is handled by the cache store itself through stats
    // This method is kept for future extension if needed
  }

  async get(id: string): Promise<Entity & T> {
    if (this.shouldBypassCache('get')) {
      return super.get(id);
    }
    
    const cacheKey = this.generateCacheKey('get', id);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as (Entity & T) | undefined;
    if (cached) {
      this.recordCacheMetrics(true, 'get');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'get');
    const result = await super.get(id);
    
    // Store in cache
    await this.cache.set(cacheKey, result, this.cacheConfig.defaultTTL);
    
    return result;
  }

  async getAll(query?: FlongoQuery, pagination?: Pagination): Promise<(Entity & T)[]> {
    if (this.shouldBypassCache('getAll', query)) {
      return super.getAll(query, pagination);
    }
    
    const cacheKey = this.generateCacheKey('getAll', undefined, query, pagination);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as (Entity & T)[] | undefined;
    if (cached) {
      this.recordCacheMetrics(true, 'getAll');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'getAll');
    const result = await super.getAll(query, pagination);
    
    // Store in cache with custom TTL if configured
    const ttl = this.cacheConfig.customTTLs?.['getAll'] || this.cacheConfig.defaultTTL;
    await this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  async getSome(query: FlongoQuery, pagination: Pagination): Promise<(Entity & T)[]> {
    if (this.shouldBypassCache('getSome', query)) {
      return super.getSome(query, pagination);
    }
    
    const cacheKey = this.generateCacheKey('getSome', undefined, query, pagination);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as (Entity & T)[] | undefined;
    if (cached) {
      this.recordCacheMetrics(true, 'getSome');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'getSome');
    const result = await super.getSome(query, pagination);
    
    // Store in cache with custom TTL if configured
    const ttl = this.cacheConfig.customTTLs?.['getSome'] || this.cacheConfig.defaultTTL;
    await this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  async getFirst(query: FlongoQuery): Promise<Entity & T> {
    if (this.shouldBypassCache('getFirst', query)) {
      return super.getFirst(query);
    }
    
    const cacheKey = this.generateCacheKey('getFirst', undefined, query);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as (Entity & T) | undefined;
    if (cached) {
      this.recordCacheMetrics(true, 'getFirst');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'getFirst');
    const result = await super.getFirst(query);
    
    // Store in cache with custom TTL if configured
    const ttl = this.cacheConfig.customTTLs?.['getFirst'] || this.cacheConfig.defaultTTL;
    await this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  async count(query?: FlongoQuery): Promise<number> {
    if (this.shouldBypassCache('count', query)) {
      return super.count(query);
    }
    
    const cacheKey = this.generateCacheKey('count', undefined, query);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as number | undefined;
    if (cached !== undefined) {
      this.recordCacheMetrics(true, 'count');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'count');
    const result = await super.count(query);
    
    // Store in cache with custom TTL if configured
    const ttl = this.cacheConfig.customTTLs?.['count'] || this.cacheConfig.defaultTTL;
    await this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  async exists(query: FlongoQuery): Promise<boolean> {
    if (this.shouldBypassCache('exists', query)) {
      return super.exists(query);
    }
    
    const cacheKey = this.generateCacheKey('exists', undefined, query);
    
    // Try to get from cache
    const cached = await this.cache.get(cacheKey) as boolean | undefined;
    if (cached !== undefined) {
      this.recordCacheMetrics(true, 'exists');
      return cached;
    }
    
    // Cache miss - fetch from database
    this.recordCacheMetrics(false, 'exists');
    const result = await super.exists(query);
    
    // Store in cache with custom TTL if configured
    const ttl = this.cacheConfig.customTTLs?.['exists'] || this.cacheConfig.defaultTTL;
    await this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  async create(attributes: T, clientId?: string): Promise<Entity & T> {
    const result = await super.create(attributes, clientId);
    
    // Invalidate count and exists caches as they might be affected
    await this.invalidateCacheByOperation('count');
    await this.invalidateCacheByOperation('exists');
    await this.invalidateCacheByOperation('getAll');
    await this.invalidateCacheByOperation('getSome');
    
    return result;
  }

  async batchCreate(attributes: T[], clientId?: string): Promise<void> {
    await super.batchCreate(attributes, clientId);
    
    // Invalidate all read operation caches
    await this.invalidateCache();
  }

  async update(id: string, attributes: any, clientId?: string): Promise<void> {
    await super.update(id, attributes, clientId);
    
    // Invalidate specific document cache and all query caches
    await this.invalidateCacheById(id);
  }

  async updateAll(attributes: any, query?: FlongoQuery, clientId?: string): Promise<void> {
    await super.updateAll(attributes, query, clientId);
    
    // Conservative approach: invalidate all caches since we don't know which documents were affected
    await this.invalidateCache();
  }

  async updateFirst(attributes: any, query?: FlongoQuery, clientId?: string): Promise<Entity & T> {
    const result = await super.updateFirst(attributes, query, clientId);
    
    // Invalidate the specific document and all query caches
    if (result && result._id) {
      await this.invalidateCacheById(result._id);
    } else {
      // If we can't determine the ID, invalidate all caches
      await this.invalidateCache();
    }
    
    return result;
  }

  async delete(id: string, clientId: string): Promise<void> {
    await super.delete(id, clientId);
    
    // Invalidate specific document cache and all query caches
    await this.invalidateCacheById(id);
  }

  async batchDelete(ids: string[], clientId: string): Promise<void> {
    await super.batchDelete(ids, clientId);
    
    // Invalidate all caches for deleted documents and queries
    for (const id of ids) {
      const cacheKey = this.generateCacheKey('get', id);
      await this.cache.delete(cacheKey);
    }
    
    // Invalidate all query caches
    await this.invalidateCacheByOperation('getAll');
    await this.invalidateCacheByOperation('getSome');
    await this.invalidateCacheByOperation('getFirst');
    await this.invalidateCacheByOperation('count');
    await this.invalidateCacheByOperation('exists');
  }

  async increment(id: string, key: string, amt?: number): Promise<void> {
    await super.increment(id, key, amt);
    await this.invalidateCacheById(id);
  }

  async decrement(id: string, key: string, amt?: number): Promise<void> {
    await super.decrement(id, key, amt);
    await this.invalidateCacheById(id);
  }

  async append(id: string, key: string, items: any[]): Promise<void> {
    await super.append(id, key, items);
    await this.invalidateCacheById(id);
  }

  async arrRemove(id: string, key: string, items: any[]): Promise<void> {
    await super.arrRemove(id, key, items);
    await this.invalidateCacheById(id);
  }

  /**
   * Invalidates cache entry for a specific document ID
   * @param id - Document ID to invalidate
   */
  async invalidateCacheById(id: string): Promise<void> {
    const cacheKey = this.generateCacheKey('get', id);
    await this.cache.delete(cacheKey);
    
    // Also invalidate any queries that might include this document
    // This is a conservative approach - in production you might want more sophisticated invalidation
    await this.invalidateCacheByOperation('getAll');
    await this.invalidateCacheByOperation('getSome');
    await this.invalidateCacheByOperation('getFirst');
    await this.invalidateCacheByOperation('count');
    await this.invalidateCacheByOperation('exists');
  }
  
  /**
   * Invalidates cache entries for a specific operation
   * @param operation - Operation name (e.g., 'get', 'getAll', 'count')
   */
  async invalidateCacheByOperation(operation: string): Promise<void> {
    const pattern = CacheKeyGenerator.generatePattern(this.collectionName, operation);
    const keys = await this.cache.keys();
    const keysToDelete = keys.filter(key => key.startsWith(pattern.replace('*', '')));
    
    for (const key of keysToDelete) {
      await this.cache.delete(key);
    }
  }

  /**
   * Invalidates cache entries matching a pattern
   * @param pattern - Pattern to match cache keys (e.g., specific operation or query)
   */
  async invalidateCache(pattern?: string): Promise<void> {
    if (!pattern) {
      // Clear all cache entries for this collection
      const collectionPattern = CacheKeyGenerator.generatePattern(this.collectionName);
      const keys = await this.cache.keys();
      const keysToDelete = keys.filter(key => key.startsWith(collectionPattern.replace('*', '')));
      
      for (const key of keysToDelete) {
        await this.cache.delete(key);
      }
    } else {
      // Clear specific pattern
      const keys = await this.cache.keys();
      const keysToDelete = keys.filter(key => key.includes(pattern));
      
      for (const key of keysToDelete) {
        await this.cache.delete(key);
      }
    }
  }

  /**
   * Warms up the cache with predefined queries
   * @param warmupQueries - Array of queries to preload into cache
   */
  async warmupCache(warmupQueries: Array<{ query?: FlongoQuery; pagination?: Pagination }>): Promise<void> {
    const warmupPromises = warmupQueries.map(async ({ query, pagination }) => {
      try {
        // Force cache population by calling the read methods
        // The methods will automatically cache the results
        if (query && pagination) {
          await this.getSome(query, pagination);
        } else if (query) {
          await this.getAll(query);
        } else {
          await this.getAll(undefined, pagination);
        }
      } catch (error) {
        console.warn(`Cache warmup failed for query: ${error}`);
      }
    });
    
    await Promise.all(warmupPromises);
  }

  /**
   * Gets cache statistics for this collection
   */
  async getCacheStats() {
    return this.cache.getStats();
  }
  
  /**
   * Resets cache statistics
   */
  async resetCacheStats() {
    return this.cache.resetStats();
  }

  /**
   * Clears all cache entries for this collection
   */
  async clearCache(): Promise<void> {
    await this.invalidateCache();
  }

  /**
   * Enables or disables caching dynamically
   * @param enabled - Whether to enable caching
   */
  setCachingEnabled(enabled: boolean): void {
    this.cachingEnabled = enabled;
  }
  
  /**
   * Gets the current caching status
   */
  isCachingEnabled(): boolean {
    return this.cachingEnabled;
  }
}