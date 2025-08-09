import { CacheStore } from "./cacheStore";
import { CacheKeyGenerator } from "./cacheKeyGenerator";
import { FlongoQuery } from "../flongoQuery";
import { Entity } from "../types";

/**
 * Handles intelligent cache invalidation strategies
 * Identifies and clears affected cached queries when data changes
 */
export class InvalidationStrategy {
  constructor(
    private cacheStore: CacheStore<any>,
    private collectionName: string
  ) {}

  /**
   * Invalidate caches when a new document is created
   */
  async invalidateOnCreate<T>(document: Entity & T): Promise<void> {
    // Clear all count queries (count has changed)
    await this.invalidatePattern('count:*');
    
    // Clear all getAll queries without specific filters
    await this.invalidatePattern('getAll:*');
    
    // Clear exists queries that might now return true
    await this.invalidatePattern('exists:*');
  }

  /**
   * Invalidate caches when a document is updated
   */
  async invalidateOnUpdate(id: string, updatedFields: any): Promise<void> {
    // Clear the specific document cache (need to generate exact key since it's hashed)
    const getKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    await this.cacheStore.delete(getKey);
    
    // Clear queries that might include this document
    await this.invalidatePattern(`getAll:*`);
    await this.invalidatePattern(`getSome:*`);
    await this.invalidatePattern(`getFirst:*`);
    
    // If certain fields are updated, we might need more targeted invalidation
    await this.invalidateAffectedQueries(id, updatedFields);
  }

  /**
   * Invalidate caches when multiple documents are updated
   */
  async invalidateOnBulkUpdate(query: FlongoQuery | undefined, updatedFields: any): Promise<void> {
    if (!query) {
      // If no query specified, all documents were updated
      await this.invalidateCollection();
    } else {
      // Invalidate all queries that might overlap with the update query
      await this.invalidatePattern('get*:*');
      await this.invalidatePattern('count:*');
      await this.invalidatePattern('exists:*');
    }
  }

  /**
   * Invalidate caches when a document is deleted
   */
  async invalidateOnDelete(id: string): Promise<void> {
    // Clear the specific document cache (need to generate exact key since it's hashed)
    const getKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    await this.cacheStore.delete(getKey);
    
    // Clear all count queries (count has changed)
    await this.invalidatePattern('count:*');
    
    // Clear all collection queries
    await this.invalidatePattern('getAll:*');
    await this.invalidatePattern('getSome:*');
    await this.invalidatePattern('getFirst:*');
    await this.invalidatePattern('exists:*');
  }

  /**
   * Invalidate caches when multiple documents are deleted
   */
  async invalidateOnBulkDelete(ids: string[]): Promise<void> {
    // Clear specific document caches
    for (const id of ids) {
      const getKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id
      });
      await this.cacheStore.delete(getKey);
    }
    
    // Clear all collection-level queries
    await this.invalidateCollection();
  }

  /**
   * Invalidate all caches for the collection
   */
  async invalidateCollection(): Promise<void> {
    const keys = await this.cacheStore.keys();
    const collectionKeys = keys.filter(key => key.startsWith(this.collectionName));
    
    for (const key of collectionKeys) {
      await this.cacheStore.delete(key);
    }
  }

  /**
   * Invalidate caches matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.cacheStore.keys();
    const fullPattern = `${this.collectionName}:${pattern}`;
    const regex = this.patternToRegex(fullPattern);
    
    const matchingKeys = keys.filter(key => regex.test(key));
    for (const key of matchingKeys) {
      await this.cacheStore.delete(key);
    }
  }

  /**
   * Invalidate specific query cache
   */
  async invalidateQuery(query: FlongoQuery): Promise<void> {
    const queryFilter = query.build();
    const patterns = [
      CacheKeyGenerator.generate({ collection: this.collectionName, operation: 'getAll', query: queryFilter }),
      CacheKeyGenerator.generate({ collection: this.collectionName, operation: 'getSome', query: queryFilter }),
      CacheKeyGenerator.generate({ collection: this.collectionName, operation: 'getFirst', query: queryFilter }),
      CacheKeyGenerator.generate({ collection: this.collectionName, operation: 'count', query: queryFilter }),
      CacheKeyGenerator.generate({ collection: this.collectionName, operation: 'exists', query: queryFilter })
    ];
    
    for (const key of patterns) {
      await this.cacheStore.delete(key);
    }
  }

  /**
   * Intelligently identify and invalidate queries affected by field changes
   */
  private async invalidateAffectedQueries(id: string, updatedFields: any): Promise<void> {
    const keys = await this.cacheStore.keys();
    const fieldNames = Object.keys(updatedFields);
    
    // Look for queries that might filter on the updated fields
    for (const key of keys) {
      if (!key.startsWith(this.collectionName)) continue;
      
      // Check if the cached query might be affected by these field changes
      const mightBeAffected = fieldNames.some(field => 
        key.includes(field) || key.includes('query')
      );
      
      if (mightBeAffected) {
        await this.cacheStore.delete(key);
      }
    }
  }

  /**
   * Convert a glob-like pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = escaped.replace(/\\\*/g, '.*');
    return new RegExp(`^${regex}$`);
  }

  /**
   * Register a custom invalidation hook
   */
  private invalidationHooks: Array<(operation: string, data: any) => Promise<void>> = [];

  async registerInvalidationHook(
    hook: (operation: string, data: any) => Promise<void>
  ): Promise<void> {
    this.invalidationHooks.push(hook);
  }

  /**
   * Execute custom invalidation hooks
   */
  private async executeHooks(operation: string, data: any): Promise<void> {
    await Promise.all(
      this.invalidationHooks.map(hook => hook(operation, data))
    );
  }
}