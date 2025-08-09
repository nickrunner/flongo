import { FlongoCollection, FlongoCollectionOptions } from "./flongoCollection";
import { FlongoQuery } from "./flongoQuery";
import { Entity, Pagination, Repository } from "./types";
import { CacheStore } from "./cache/cacheStore";
import { MemoryCache } from "./cache/memoryCache";
import { CacheKeyGenerator } from "./cache/cacheKeyGenerator";
import { CacheConfiguration, CacheMode } from "./cache/cacheConfig";
import { CacheStatsCollector } from "./cache/cacheStats";
import { InvalidationStrategy } from "./cache/invalidationStrategy";
import { WriteThrough } from "./cache/writeThrough";
import { CacheManager } from "./cache/cacheManager";

/**
 * Extended options for CachedFlongoCollection
 */
export interface CachedFlongoCollectionOptions extends FlongoCollectionOptions {
  /** Enable or disable caching */
  enableCaching?: boolean;
  /** Cache configuration */
  cacheConfig?: CacheConfiguration;
  /** Custom cache store implementation */
  cacheStore?: CacheStore<any>;
  /** Cache mode (read-through, write-through, or both) */
  cacheMode?: CacheMode;
}

/**
 * CachedFlongoCollection extends FlongoCollection to provide transparent caching
 * for all database operations. It maintains full API compatibility while adding
 * intelligent caching with automatic invalidation.
 * 
 * Features:
 * - Read-through caching for all query operations
 * - Write-through caching for mutations
 * - Intelligent cache invalidation
 * - Atomic operation support
 * - Manual cache management APIs
 * 
 * @template T - The document type for this collection
 */
export class CachedFlongoCollection<T> extends FlongoCollection<T> {
  private cacheStore: CacheStore<any>;
  private collectionName: Repository;
  private cacheConfig: CacheConfiguration;
  private statsCollector: CacheStatsCollector;
  private invalidationStrategy: InvalidationStrategy;
  private writeThrough: WriteThrough<T>;
  private cacheManager: CacheManager;
  private cacheEnabled: boolean;
  private cacheMode: CacheMode;

  constructor(
    collectionName: Repository,
    options: CachedFlongoCollectionOptions = {}
  ) {
    super(collectionName, options);

    this.collectionName = collectionName;

    // Initialize caching configuration
    this.cacheEnabled = options.enableCaching ?? true;
    this.cacheMode = options.cacheMode ?? CacheMode.READ_WRITE;
    this.cacheConfig = options.cacheConfig ?? CacheConfiguration.development();

    // Initialize cache components
    this.cacheStore = options.cacheStore ?? new MemoryCache({
      maxEntries: this.cacheConfig.maxEntries,
      defaultTTL: this.cacheConfig.ttlSeconds,
      enableStats: this.cacheConfig.enableStats
    });

    this.statsCollector = new CacheStatsCollector();
    this.invalidationStrategy = new InvalidationStrategy(
      this.cacheStore,
      collectionName
    );
    this.writeThrough = new WriteThrough(
      this.cacheStore,
      collectionName,
      this.invalidationStrategy
    );
    this.cacheManager = new CacheManager(
      this.cacheStore,
      this.statsCollector,
      this.invalidationStrategy
    );
  }

  // ===========================================
  // READ OPERATIONS WITH CACHING
  // ===========================================

  async get(id: string): Promise<Entity & T> {
    if (!this.shouldUseCache('read')) {
      return super.get(id);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.statsCollector.recordHit();
      return cached as Entity & T;
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.get(id);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  async getAll(query?: FlongoQuery, pagination?: Pagination): Promise<(Entity & T)[]> {
    if (!this.shouldUseCache('read')) {
      return super.getAll(query, pagination);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getAll',
      query: query,
      pagination
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.statsCollector.recordHit();
      return cached as (Entity & T)[];
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.getAll(query, pagination);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  async getSome(query: FlongoQuery, pagination: Pagination): Promise<(Entity & T)[]> {
    if (!this.shouldUseCache('read')) {
      return super.getSome(query, pagination);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getSome',
      query: query,
      pagination
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.statsCollector.recordHit();
      return cached as (Entity & T)[];
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.getSome(query, pagination);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  async getFirst(query: FlongoQuery): Promise<Entity & T> {
    if (!this.shouldUseCache('read')) {
      return super.getFirst(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getFirst',
      query: query
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      this.statsCollector.recordHit();
      return cached as Entity & T;
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.getFirst(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  async count(query?: FlongoQuery): Promise<number> {
    if (!this.shouldUseCache('read')) {
      return super.count(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'count',
      query: query
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached !== undefined) {
      this.statsCollector.recordHit();
      return cached as number;
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.count(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  async exists(query: FlongoQuery): Promise<boolean> {
    if (!this.shouldUseCache('read')) {
      return super.exists(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'exists',
      query: query
    });
    
    // Try to get from cache
    const cached = await this.cacheStore.get(cacheKey);
    if (cached !== undefined) {
      this.statsCollector.recordHit();
      return cached as boolean;
    }

    // Cache miss - fetch from database
    this.statsCollector.recordMiss();
    const result = await super.exists(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttlSeconds);
    
    return result;
  }

  // ===========================================
  // WRITE OPERATIONS WITH CACHE INVALIDATION
  // ===========================================

  async create(attributes: T, clientId?: string): Promise<Entity & T> {
    const result = await super.create(attributes, clientId);
    
    if (this.shouldUseCache('write')) {
      // Perform write-through caching
      await this.writeThrough.handleCreate(result);
      
      // Invalidate affected queries
      await this.invalidationStrategy.invalidateOnCreate(result);
    }
    
    return result;
  }

  async batchCreate(attributes: T[], clientId?: string): Promise<void> {
    await super.batchCreate(attributes, clientId);
    
    if (this.shouldUseCache('write')) {
      // Invalidate all cached queries for this collection
      await this.invalidationStrategy.invalidateCollection();
    }
  }

  async update(id: string, attributes: any, clientId?: string): Promise<void> {
    await super.update(id, attributes, clientId);
    
    if (this.shouldUseCache('write')) {
      // Invalidate specific document and related queries
      await this.invalidationStrategy.invalidateOnUpdate(id, attributes);
    }
  }

  async updateAll(attributes: any, query?: FlongoQuery, clientId?: string): Promise<void> {
    await super.updateAll(attributes, query, clientId);
    
    if (this.shouldUseCache('write')) {
      // Invalidate all affected queries
      await this.invalidationStrategy.invalidateOnBulkUpdate(query, attributes);
    }
  }

  async updateFirst(attributes: any, query?: FlongoQuery, clientId?: string): Promise<Entity & T> {
    const result = await super.updateFirst(attributes, query, clientId);
    
    if (this.shouldUseCache('write')) {
      // Update cache with new data
      await this.writeThrough.handleUpdate(result._id, result);
      
      // Invalidate related queries
      await this.invalidationStrategy.invalidateOnUpdate(result._id, attributes);
    }
    
    return result;
  }

  async delete(id: string, clientId: string): Promise<void> {
    await super.delete(id, clientId);
    
    if (this.shouldUseCache('write')) {
      // Remove from cache and invalidate related queries
      await this.invalidationStrategy.invalidateOnDelete(id);
    }
  }

  async batchDelete(ids: string[], clientId: string): Promise<void> {
    await super.batchDelete(ids, clientId);
    
    if (this.shouldUseCache('write')) {
      // Invalidate all affected items
      await this.invalidationStrategy.invalidateOnBulkDelete(ids);
    }
  }

  // ===========================================
  // ATOMIC OPERATIONS WITH CACHE UPDATES
  // ===========================================

  async increment(id: string, key: string, amt?: number): Promise<void> {
    await super.increment(id, key, amt);
    
    if (this.shouldUseCache('write')) {
      // Update cached document if it exists
      await this.writeThrough.handleAtomicOperation(id, 'increment', { key, value: amt ?? 1 });
    }
  }

  async decrement(id: string, key: string, amt?: number): Promise<void> {
    await super.decrement(id, key, amt);
    
    if (this.shouldUseCache('write')) {
      // Update cached document if it exists
      await this.writeThrough.handleAtomicOperation(id, 'decrement', { key, value: amt ?? 1 });
    }
  }

  async append(id: string, key: string, items: any[]): Promise<void> {
    await super.append(id, key, items);
    
    if (this.shouldUseCache('write')) {
      // Update cached document if it exists
      await this.writeThrough.handleAtomicOperation(id, 'append', { key, value: items });
    }
  }

  async arrRemove(id: string, key: string, items: any[]): Promise<void> {
    await super.arrRemove(id, key, items);
    
    if (this.shouldUseCache('write')) {
      // Update cached document if it exists
      await this.writeThrough.handleAtomicOperation(id, 'arrRemove', { key, value: items });
    }
  }

  // ===========================================
  // CACHE MANAGEMENT API
  // ===========================================

  /**
   * Clear all cached entries for this collection
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.clearCollection();
  }

  /**
   * Clear specific cached query results
   */
  async clearQuery(query: FlongoQuery): Promise<void> {
    await this.cacheManager.clearQuery(query);
  }

  /**
   * Refresh cached data for a specific document
   */
  async refreshDocument(id: string): Promise<Entity & T> {
    const result = await super.get(id);
    await this.writeThrough.handleUpdate(id, result);
    return result;
  }

  /**
   * Preload frequently accessed data into cache
   */
  async preloadCache(queries: FlongoQuery[]): Promise<void> {
    await this.cacheManager.preload(queries, async (query) => {
      return await super.getAll(query);
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return {
      store: await this.cacheStore.getStats(),
      collector: this.statsCollector.getStats()
    };
  }

  /**
   * Verify cache consistency with database
   */
  async verifyCacheConsistency(sampleSize?: number): Promise<{
    consistent: boolean;
    inconsistencies: string[];
  }> {
    return await this.cacheManager.verifyConsistency(
      sampleSize,
      async (id) => await super.get(id)
    );
  }

  // ===========================================
  // PRIVATE HELPER METHODS
  // ===========================================

  private shouldUseCache(operation: 'read' | 'write'): boolean {
    if (!this.cacheEnabled) {
      return false;
    }

    if (operation === 'read') {
      return this.cacheMode === CacheMode.READ_ONLY || 
             this.cacheMode === CacheMode.READ_WRITE;
    } else {
      return this.cacheMode === CacheMode.WRITE_THROUGH || 
             this.cacheMode === CacheMode.READ_WRITE;
    }
  }
}