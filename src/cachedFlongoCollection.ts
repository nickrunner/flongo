import { FlongoCollection, FlongoCollectionOptions } from "./flongoCollection";
import { FlongoQuery } from "./flongoQuery";
import { Entity, Pagination, Repository } from "./types";
import { CacheStore } from "./cache/cacheStore";
import { MemoryCache } from "./cache/memoryCache";
import { CacheKeyGenerator } from "./cache/cacheKeyGenerator";

/**
 * Configuration options for CachedFlongoCollection instances
 */
export interface CachedFlongoCollectionOptions extends FlongoCollectionOptions {
  /** Whether caching is enabled for this collection */
  cacheEnabled?: boolean;
  /** Time-to-live for cached entries in seconds */
  cacheTTL?: number;
  /** Maximum number of cached entries */
  cacheMaxEntries?: number;
  /** Custom cache store implementation */
  cacheStore?: CacheStore<any>;
  /** Function to determine if a query should bypass cache */
  cacheBypassPredicate?: (query?: FlongoQuery) => boolean;
  /** Queries to warmup on initialization */
  warmupQueries?: Array<{ query?: FlongoQuery; pagination?: Pagination }>;
}

/**
 * CachedFlongoCollection extends FlongoCollection to provide transparent caching
 * for all read operations. It maintains full API compatibility while intercepting
 * read operations to check cache before querying MongoDB, and updating cache with
 * fetched results.
 *
 * Features:
 * - Read-through caching for all read operations
 * - Automatic cache invalidation on mutations
 * - Query result normalization for consistent caching
 * - Cache warmup capabilities
 * - Configurable cache behavior per collection
 * - Cache bypass mechanism for specific queries
 *
 * Example usage:
 * ```typescript
 * const users = new CachedFlongoCollection<User>('users', {
 *   cacheEnabled: true,
 *   cacheTTL: 300, // 5 minutes
 *   cacheMaxEntries: 1000
 * });
 * ```
 */
export class CachedFlongoCollection<T> extends FlongoCollection<T> {
  private cacheStore: CacheStore<any>;
  private cacheConfig: {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    bypassPredicate?: (query?: FlongoQuery) => boolean;
  };
  private collectionName: Repository;

  /**
   * Creates a new CachedFlongoCollection instance
   * @param collectionName - Name of the MongoDB collection
   * @param options - Configuration options for caching and collection behavior
   */
  constructor(collectionName: Repository, options: CachedFlongoCollectionOptions = {}) {
    super(collectionName, options);
    
    this.collectionName = collectionName;
    
    // Initialize cache configuration
    this.cacheConfig = {
      enabled: options.cacheEnabled ?? true,
      ttl: options.cacheTTL ?? 300, // Default 5 minutes
      maxEntries: options.cacheMaxEntries ?? 10000,
      bypassPredicate: options.cacheBypassPredicate
    };
    
    // Initialize cache store
    this.cacheStore = options.cacheStore ?? new MemoryCache({
      maxEntries: this.cacheConfig.maxEntries,
      defaultTTL: this.cacheConfig.ttl,
      enableStats: true
    });
    
    // Perform cache warmup if configured
    if (options.warmupQueries && options.warmupQueries.length > 0) {
      this.warmupCache(options.warmupQueries).catch(err => {
        console.warn(`Cache warmup failed for collection ${collectionName}:`, err);
      });
    }
  }

  // ===========================================
  // READ OPERATIONS WITH CACHING
  // ===========================================

  /**
   * Retrieves a single document by its ID with caching
   * @param id - Document ID (string that will be converted to ObjectId)
   * @returns Promise resolving to the document with Entity metadata
   * @throws Error404 if document is not found
   */
  async get(id: string): Promise<Entity & T> {
    if (!this.cacheConfig.enabled) {
      return super.get(id);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      return cached as Entity & T;
    }

    // Cache miss - fetch from database
    const result = await super.get(id);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  /**
   * Retrieves multiple documents based on query and pagination with caching
   * @param query - Optional FlongoQuery for filtering
   * @param pagination - Optional pagination settings
   * @returns Promise resolving to array of documents
   */
  async getAll(query?: FlongoQuery, pagination?: Pagination): Promise<(Entity & T)[]> {
    if (!this.cacheConfig.enabled || this.shouldBypassCache(query)) {
      return super.getAll(query, pagination);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getAll',
      query: query || new FlongoQuery(),
      pagination
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      return cached as (Entity & T)[];
    }

    // Cache miss - fetch from database
    const result = await super.getAll(query, pagination);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  /**
   * Retrieves a subset of documents with caching
   * @param query - FlongoQuery for filtering (required)
   * @param pagination - Pagination settings (required)
   * @returns Promise resolving to array of documents
   */
  async getSome(query: FlongoQuery, pagination: Pagination): Promise<(Entity & T)[]> {
    if (!this.cacheConfig.enabled || this.shouldBypassCache(query)) {
      return super.getSome(query, pagination);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getSome',
      query,
      pagination
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      return cached as (Entity & T)[];
    }

    // Cache miss - fetch from database
    const result = await super.getSome(query, pagination);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  /**
   * Retrieves the first document matching the query with caching
   * @param query - FlongoQuery for filtering
   * @returns Promise resolving to the first matching document
   */
  async getFirst(query: FlongoQuery): Promise<Entity & T> {
    if (!this.cacheConfig.enabled || this.shouldBypassCache(query)) {
      return super.getFirst(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'getFirst',
      query
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      return cached as Entity & T;
    }

    // Cache miss - fetch from database
    const result = await super.getFirst(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  /**
   * Counts documents matching the query with caching
   * @param query - Optional FlongoQuery for filtering
   * @returns Promise resolving to the count of matching documents
   */
  async count(query?: FlongoQuery): Promise<number> {
    if (!this.cacheConfig.enabled || this.shouldBypassCache(query)) {
      return super.count(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'count',
      query: query || new FlongoQuery()
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached !== undefined) {
      return cached as number;
    }

    // Cache miss - fetch from database
    const result = await super.count(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  /**
   * Checks if any documents match the query with caching
   * @param query - FlongoQuery for filtering
   * @returns Promise resolving to true if any documents match, false otherwise
   */
  async exists(query: FlongoQuery): Promise<boolean> {
    if (!this.cacheConfig.enabled || this.shouldBypassCache(query)) {
      return super.exists(query);
    }

    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'exists',
      query
    });

    // Check cache first
    const cached = await this.cacheStore.get(cacheKey);
    if (cached !== undefined) {
      return cached as boolean;
    }

    // Cache miss - fetch from database
    const result = await super.exists(query);
    
    // Store in cache
    await this.cacheStore.set(cacheKey, result, this.cacheConfig.ttl);
    
    return result;
  }

  // ===========================================
  // WRITE OPERATIONS WITH CACHE INVALIDATION
  // ===========================================

  /**
   * Creates a new document and invalidates relevant caches
   * @param attributes - Document data (without Entity metadata)
   * @param clientId - Optional client ID for audit trail
   * @returns Promise resolving to the created document with Entity metadata
   */
  async create(attributes: T, clientId?: string): Promise<Entity & T> {
    const result = await super.create(attributes, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
    
    return result;
  }

  /**
   * Creates multiple documents and invalidates relevant caches
   * @param attributes - Array of document data
   * @param clientId - Optional client ID for audit trail
   */
  async batchCreate(attributes: T[], clientId?: string): Promise<void> {
    await super.batchCreate(attributes, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Updates a single document and invalidates relevant caches
   * @param id - Document ID to update
   * @param attributes - Fields to update
   * @param clientId - Optional client ID for audit trail
   */
  async update(id: string, attributes: any, clientId?: string): Promise<void> {
    await super.update(id, attributes, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Updates multiple documents and invalidates relevant caches
   * @param attributes - Fields to update
   * @param query - Optional FlongoQuery to filter documents
   * @param clientId - Optional client ID for audit trail
   */
  async updateAll(attributes: any, query?: FlongoQuery, clientId?: string): Promise<void> {
    await super.updateAll(attributes, query, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate all caches for this collection
      await this.clearCache();
    }
  }

  /**
   * Updates the first document and invalidates relevant caches
   * @param attributes - Fields to update
   * @param query - Optional FlongoQuery to filter documents
   * @param clientId - Optional client ID for audit trail
   * @returns Promise resolving to the updated document
   */
  async updateFirst(attributes: any, query?: FlongoQuery, clientId?: string): Promise<Entity & T> {
    const result = await super.updateFirst(attributes, query, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate the specific document cache if we have the ID
      if (result._id) {
        const getKey = CacheKeyGenerator.generate({
          collection: this.collectionName,
          operation: 'get',
          id: result._id
        });
        await this.cacheStore.delete(getKey);
      }
      
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
    
    return result;
  }

  /**
   * Deletes a single document and invalidates relevant caches
   * @param id - Document ID to delete
   * @param clientId - ID of the client performing the deletion
   */
  async delete(id: string, clientId: string): Promise<void> {
    await super.delete(id, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Deletes multiple documents and invalidates relevant caches
   * @param ids - Array of document IDs to delete
   * @param clientId - ID of the client performing the deletion
   */
  async batchDelete(ids: string[], clientId: string): Promise<void> {
    await super.batchDelete(ids, clientId);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document caches
      for (const id of ids) {
        const getKey = CacheKeyGenerator.generate({
          collection: this.collectionName,
          operation: 'get',
          id
        });
        await this.cacheStore.delete(getKey);
      }
      
      // Invalidate all query caches for this collection
      await this.invalidateQueryCaches();
    }
  }

  // ===========================================
  // ATOMIC OPERATIONS WITH CACHE INVALIDATION
  // ===========================================

  /**
   * Atomically increments a numeric field and invalidates cache
   * @param id - Document ID
   * @param key - Field name to increment
   * @param amt - Amount to increment by (defaults to 1)
   */
  async increment(id: string, key: string, amt?: number): Promise<void> {
    await super.increment(id, key, amt);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate query caches that might include this document
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Atomically decrements a numeric field and invalidates cache
   * @param id - Document ID
   * @param key - Field name to decrement
   * @param amt - Amount to decrement by (defaults to 1)
   */
  async decrement(id: string, key: string, amt?: number): Promise<void> {
    await super.decrement(id, key, amt);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate query caches that might include this document
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Atomically appends items to an array field and invalidates cache
   * @param id - Document ID
   * @param key - Array field name
   * @param items - Items to append to the array
   */
  async append(id: string, key: string, items: any[]): Promise<void> {
    await super.append(id, key, items);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate query caches that might include this document
      await this.invalidateQueryCaches();
    }
  }

  /**
   * Atomically removes items from an array field and invalidates cache
   * @param id - Document ID
   * @param key - Array field name
   * @param items - Items to remove from the array
   */
  async arrRemove(id: string, key: string, items: any[]): Promise<void> {
    await super.arrRemove(id, key, items);
    
    if (this.cacheConfig.enabled) {
      // Invalidate specific document cache
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
      
      // Invalidate query caches that might include this document
      await this.invalidateQueryCaches();
    }
  }

  // ===========================================
  // CACHE MANAGEMENT
  // ===========================================

  /**
   * Warms up the cache with predefined queries
   * @param queries - Array of queries to execute and cache
   */
  async warmupCache(queries: Array<{ query?: FlongoQuery; pagination?: Pagination }>): Promise<void> {
    if (!this.cacheConfig.enabled) {
      return;
    }

    const warmupPromises = queries.map(async ({ query, pagination }) => {
      try {
        // Execute the query to populate cache
        await this.getAll(query, pagination);
      } catch (err) {
        console.warn(`Cache warmup query failed:`, err);
      }
    });

    await Promise.all(warmupPromises);
  }

  /**
   * Clears all cached entries for this collection
   */
  async clearCache(): Promise<void> {
    if (!this.cacheConfig.enabled) {
      return;
    }

    // Get all keys for this collection
    const keys = await this.cacheStore.keys();
    const collectionKeys = keys.filter(key => 
      CacheKeyGenerator.getCollectionFromKey(key) === this.collectionName
    );

    // Delete all collection keys
    for (const key of collectionKeys) {
      await this.cacheStore.delete(key);
    }
  }

  /**
   * Invalidates cache entries matching a pattern
   * @param pattern - Pattern to match cache keys (e.g., "flongo:users:getAll*")
   */
  async invalidateCache(pattern?: string): Promise<void> {
    if (!this.cacheConfig.enabled) {
      return;
    }

    const searchPattern = pattern || CacheKeyGenerator.generatePattern(this.collectionName);
    const keys = await this.cacheStore.keys();
    const matchingKeys = keys.filter(key => {
      if (pattern) {
        // Use glob-like pattern matching
        const regex = new RegExp(searchPattern.replace(/\*/g, '.*'));
        return regex.test(key);
      } else {
        // Match all keys for this collection
        return CacheKeyGenerator.getCollectionFromKey(key) === this.collectionName;
      }
    });

    // Delete matching keys
    for (const key of matchingKeys) {
      await this.cacheStore.delete(key);
    }
  }

  /**
   * Gets cache statistics for this collection
   * @returns Promise resolving to cache statistics
   */
  async getCacheStats(): Promise<any> {
    if (!this.cacheConfig.enabled) {
      return {
        enabled: false,
        stats: null
      };
    }

    const stats = await this.cacheStore.getStats();
    const keys = await this.cacheStore.keys();
    const collectionKeys = keys.filter(key => 
      CacheKeyGenerator.getCollectionFromKey(key) === this.collectionName
    );

    return {
      enabled: true,
      collection: this.collectionName,
      config: this.cacheConfig,
      collectionEntries: collectionKeys.length,
      totalStats: stats
    };
  }

  /**
   * Enables or disables caching for this collection
   * @param enabled - Whether caching should be enabled
   */
  setCachingEnabled(enabled: boolean): void {
    this.cacheConfig.enabled = enabled;
    if (!enabled) {
      // Clear cache when disabling
      this.clearCache().catch(err => {
        console.warn(`Failed to clear cache when disabling:`, err);
      });
    }
  }

  /**
   * Updates cache configuration
   * @param config - Partial configuration to update
   */
  updateCacheConfig(config: Partial<typeof this.cacheConfig>): void {
    Object.assign(this.cacheConfig, config);
  }

  // ===========================================
  // PRIVATE HELPER METHODS
  // ===========================================

  /**
   * Determines if a query should bypass the cache
   * @private
   * @param query - Query to check
   * @returns True if cache should be bypassed
   */
  private shouldBypassCache(query?: FlongoQuery): boolean {
    if (!this.cacheConfig.bypassPredicate) {
      return false;
    }
    return this.cacheConfig.bypassPredicate(query);
  }

  /**
   * Invalidates all query caches for this collection
   * @private
   */
  private async invalidateQueryCaches(): Promise<void> {
    const keys = await this.cacheStore.keys();
    const queryKeys = keys.filter(key => {
      const parsed = CacheKeyGenerator.parseKey(key);
      return parsed.collection === this.collectionName && 
             parsed.operation && 
             ['getAll', 'getSome', 'getFirst', 'count', 'exists'].includes(parsed.operation);
    });

    for (const key of queryKeys) {
      await this.cacheStore.delete(key);
    }
  }
}