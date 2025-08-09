import { CacheStore } from "./cacheStore";
import { CacheKeyGenerator } from "./cacheKeyGenerator";
import { InvalidationStrategy } from "./invalidationStrategy";
import { Entity } from "../types";

/**
 * Atomic operation types supported by the cache
 */
export type AtomicOperationType = 'increment' | 'decrement' | 'append' | 'arrRemove';

/**
 * Data for atomic operations
 */
export interface AtomicOperationData {
  key: string;
  value: any;
}

/**
 * Handles write-through caching operations
 * Updates cache simultaneously with database writes
 */
export class WriteThrough<T> {
  constructor(
    private cacheStore: CacheStore<any>,
    private collectionName: string,
    private invalidationStrategy: InvalidationStrategy
  ) {}

  /**
   * Handle cache update after document creation
   */
  async handleCreate(document: Entity & T): Promise<void> {
    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id: document._id
    });
    
    // Cache the newly created document
    await this.cacheStore.set(cacheKey, document);
  }

  /**
   * Handle cache update after document update
   */
  async handleUpdate(id: string, document: Entity & T): Promise<void> {
    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    
    // Update the cached document
    await this.cacheStore.set(cacheKey, document);
  }

  /**
   * Handle atomic operations on cached documents
   */
  async handleAtomicOperation(
    id: string,
    operation: AtomicOperationType,
    data: AtomicOperationData
  ): Promise<void> {
    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    const cached = await this.cacheStore.get(cacheKey);
    
    if (!cached) {
      // Document not in cache, invalidate related queries
      await this.invalidationStrategy.invalidatePattern(`*${id}*`);
      return;
    }

    // Apply the atomic operation to the cached document
    const updated = this.applyAtomicOperation(cached, operation, data);
    
    // Update the cache with modified document
    await this.cacheStore.set(cacheKey, updated);
    
    // Invalidate queries that might be affected by this change
    await this.invalidateRelatedQueries(id, operation, data);
  }

  /**
   * Apply atomic operation to a cached document
   */
  private applyAtomicOperation(
    document: any,
    operation: AtomicOperationType,
    data: AtomicOperationData
  ): any {
    const updated = { ...document };
    
    switch (operation) {
      case 'increment':
        updated[data.key] = (updated[data.key] || 0) + data.value;
        break;
        
      case 'decrement':
        updated[data.key] = (updated[data.key] || 0) - data.value;
        break;
        
      case 'append':
        if (!Array.isArray(updated[data.key])) {
          updated[data.key] = [];
        }
        updated[data.key].push(...data.value);
        break;
        
      case 'arrRemove':
        if (Array.isArray(updated[data.key])) {
          updated[data.key] = updated[data.key].filter(
            (item: any) => !data.value.includes(item)
          );
        }
        break;
    }
    
    // Update the updatedAt timestamp
    updated.updatedAt = Date.now();
    
    return updated;
  }

  /**
   * Invalidate queries that might be affected by an atomic operation
   */
  private async invalidateRelatedQueries(
    id: string,
    operation: AtomicOperationType,
    data: AtomicOperationData
  ): Promise<void> {
    // Invalidate queries that filter on the modified field
    await this.invalidationStrategy.invalidatePattern(`*${data.key}*`);
    
    // For array operations, invalidate array-specific queries
    if (operation === 'append' || operation === 'arrRemove') {
      await this.invalidationStrategy.invalidatePattern(`*arrContains*`);
      await this.invalidationStrategy.invalidatePattern(`*in*`);
    }
    
    // For numeric operations, invalidate range queries
    if (operation === 'increment' || operation === 'decrement') {
      await this.invalidationStrategy.invalidatePattern(`*gt*`);
      await this.invalidationStrategy.invalidatePattern(`*lt*`);
      await this.invalidationStrategy.invalidatePattern(`*inRange*`);
    }
  }

  /**
   * Batch update multiple cached documents
   */
  async handleBatchUpdate(documents: Array<Entity & T>): Promise<void> {
    const updates = documents.map(async (doc) => {
      const cacheKey = CacheKeyGenerator.generate({
        collection: this.collectionName,
        operation: 'get',
        id: doc._id
      });
      return this.cacheStore.set(cacheKey, doc);
    });
    
    await Promise.all(updates);
  }

  /**
   * Handle optimistic updates (update cache before database)
   */
  async handleOptimisticUpdate(
    id: string,
    updateFn: (doc: Entity & T) => Entity & T
  ): Promise<Entity & T | null> {
    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    const cached = await this.cacheStore.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Apply the update optimistically
    const updated = updateFn(cached as Entity & T);
    await this.cacheStore.set(cacheKey, updated);
    
    return updated;
  }

  /**
   * Rollback an optimistic update if database operation fails
   */
  async rollbackOptimisticUpdate(id: string, original: Entity & T): Promise<void> {
    const cacheKey = CacheKeyGenerator.generate({
      collection: this.collectionName,
      operation: 'get',
      id
    });
    await this.cacheStore.set(cacheKey, original);
  }
}