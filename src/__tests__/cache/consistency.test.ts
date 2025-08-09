import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../cache/cacheManager';
import { CacheStore } from '../../cache/cacheStore';
import { CacheStatsCollector } from '../../cache/cacheStats';
import { InvalidationStrategy } from '../../cache/invalidationStrategy';
import { CacheKeyGenerator } from '../../cache/cacheKeyGenerator';
import { FlongoQuery } from '../../flongoQuery';
import { Entity } from '../../types';

// Mock implementations
class MockCacheStore implements CacheStore<any> {
  private store = new Map<string, any>();
  
  async get(key: string): Promise<any> {
    return this.store.get(key);
  }
  
  async set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
  
  async clear(): Promise<void> {
    this.store.clear();
  }
  
  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }
  
  async size(): Promise<number> {
    return this.store.size;
  }
  
  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
  
  async getStats(): Promise<any> {
    return { 
      size: this.store.size,
      memoryUsage: JSON.stringify(Array.from(this.store.values())).length
    };
  }
  
  async resetStats(): Promise<void> {}
}

describe('CacheManager - Consistency Verification', () => {
  let cacheStore: MockCacheStore;
  let statsCollector: CacheStatsCollector;
  let invalidationStrategy: InvalidationStrategy;
  let cacheManager: CacheManager;
  const collectionName = 'users';
  
  beforeEach(() => {
    cacheStore = new MockCacheStore();
    statsCollector = new CacheStatsCollector();
    invalidationStrategy = new InvalidationStrategy(cacheStore, collectionName);
    cacheManager = new CacheManager(cacheStore, statsCollector, invalidationStrategy);
  });
  
  describe('verifyConsistency', () => {
    it('should detect no inconsistencies when cache matches database', async () => {
      // Setup cached documents
      const doc1 = { _id: '1', name: 'User 1', createdAt: 1000, updatedAt: 1000 };
      const doc2 = { _id: '2', name: 'User 2', createdAt: 2000, updatedAt: 2000 };
      
      await cacheStore.set(`${collectionName}:get:{"id":"1"}`, doc1);
      await cacheStore.set(`${collectionName}:get:{"id":"2"}`, doc2);
      
      // Mock fetch function that returns same data
      const fetchFn = vi.fn(async (id: string) => {
        if (id === '1') return doc1;
        if (id === '2') return doc2;
        throw new Error('Not found');
      });
      
      const result = await cacheManager.verifyConsistency(10, fetchFn);
      
      expect(result.consistent).toBe(true);
      expect(result.inconsistencies).toHaveLength(0);
    });
    
    it('should detect inconsistencies when cache differs from database', async () => {
      // Setup cached documents (outdated)
      const cachedDoc = { _id: '1', name: 'Old Name', createdAt: 1000, updatedAt: 1000 };
      await cacheStore.set(`${collectionName}:get:{"id":"1"}`, cachedDoc);
      
      // Mock fetch function that returns updated data
      const freshDoc = { _id: '1', name: 'New Name', createdAt: 1000, updatedAt: 2000 };
      const fetchFn = vi.fn(async () => freshDoc);
      
      const result = await cacheManager.verifyConsistency(10, fetchFn);
      
      expect(result.consistent).toBe(false);
      expect(result.inconsistencies).toContain('Document 1 is inconsistent');
    });
    
    it('should sample only requested number of documents', async () => {
      // Setup many cached documents
      for (let i = 1; i <= 20; i++) {
        await cacheStore.set(
          `${collectionName}:get:{"id":"${i}"}`,
          { _id: String(i), name: `User ${i}` }
        );
      }
      
      const fetchFn = vi.fn(async (id: string) => ({
        _id: id,
        name: `User ${id}`
      }));
      
      await cacheManager.verifyConsistency(5, fetchFn);
      
      // Should only check 5 documents
      expect(fetchFn).toHaveBeenCalledTimes(5);
    });
    
    it('should handle fetch errors gracefully', async () => {
      const cachedDoc = { _id: '1', name: 'User 1' };
      await cacheStore.set(`${collectionName}:get:{"id":"1"}`, cachedDoc);
      
      const fetchFn = vi.fn(async () => {
        throw new Error('Database connection failed');
      });
      
      const result = await cacheManager.verifyConsistency(10, fetchFn);
      
      expect(result.consistent).toBe(false);
      expect(result.inconsistencies[0]).toContain('Failed to verify document 1');
    });
  });
  
  describe('clearCollection', () => {
    it('should clear all collection caches', async () => {
      await cacheStore.set(`flongo:${collectionName}:get:1`, { _id: '1' });
      await cacheStore.set(`flongo:${collectionName}:getAll:query`, []);
      await cacheStore.set('flongo:otherCollection:get:1', { _id: '1' });
      
      await cacheManager.clearCollection();
      
      const keys = await cacheStore.keys();
      expect(keys).toEqual(['flongo:otherCollection:get:1']);
    });
    
    it('should record clear in stats', async () => {
      await cacheManager.clearCollection();
      
      const stats = statsCollector.getStats();
      expect(stats.clears).toBe(1);
    });
  });
  
  describe('clearQuery', () => {
    it('should clear specific query caches', async () => {
      const query = new FlongoQuery().where('status').eq('active');
      
      // Use CacheKeyGenerator to create proper keys
      const getAllKey = CacheKeyGenerator.generate({ collection: collectionName, operation: 'getAll', query: query });
      const countKey = CacheKeyGenerator.generate({ collection: collectionName, operation: 'count', query: query });
      const otherKey = CacheKeyGenerator.generate({ collection: collectionName, operation: 'getAll' });
      
      // Set up various caches
      await cacheStore.set(getAllKey, []);
      await cacheStore.set(countKey, 0);
      await cacheStore.set(otherKey, []);
      
      await cacheManager.clearQuery(query);
      
      const keys = await cacheStore.keys();
      // Only the 'other' cache should remain
      expect(keys).toContain(otherKey);
      expect(keys).not.toContain(getAllKey);
      expect(keys).not.toContain(countKey);
    });
  });
  
  describe('preload', () => {
    it('should preload data using fetch function', async () => {
      const queries = [
        new FlongoQuery().where('status').eq('active'),
        new FlongoQuery().where('role').eq('admin')
      ];
      
      const fetchFn = vi.fn(async (query: FlongoQuery) => {
        return [{ _id: '1', status: 'active' }];
      });
      
      await cacheManager.preload(queries, fetchFn);
      
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(fetchFn).toHaveBeenCalledWith(queries[0]);
      expect(fetchFn).toHaveBeenCalledWith(queries[1]);
    });
  });
  
  describe('warmup', () => {
    it('should warmup cache with specific documents', async () => {
      const ids = ['1', '2', '3'];
      const fetchFn = vi.fn(async (id: string) => ({
        _id: id,
        name: `User ${id}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));
      
      await cacheManager.warmup(ids, fetchFn);
      
      expect(fetchFn).toHaveBeenCalledTimes(3);
      ids.forEach(id => {
        expect(fetchFn).toHaveBeenCalledWith(id);
      });
    });
  });
  
  describe('getDebugInfo', () => {
    it('should return detailed cache information', async () => {
      // Setup some cache entries
      await cacheStore.set('key1', { data: 'value1' });
      await cacheStore.set('key2', { data: 'value2' });
      
      // Record some stats
      statsCollector.recordHit();
      statsCollector.recordHit();
      statsCollector.recordMiss();
      
      const debugInfo = await cacheManager.getDebugInfo();
      
      expect(debugInfo.totalEntries).toBe(2);
      expect(debugInfo.hitRate).toBeCloseTo(66.67, 1);
      expect(debugInfo.keys).toContain('key1');
      expect(debugInfo.keys).toContain('key2');
      expect(debugInfo.memoryUsage).toBeGreaterThan(0);
    });
    
    it('should limit keys to 100 for readability', async () => {
      // Add more than 100 cache entries
      for (let i = 0; i < 150; i++) {
        await cacheStore.set(`key${i}`, { data: `value${i}` });
      }
      
      const debugInfo = await cacheManager.getDebugInfo();
      
      expect(debugInfo.totalEntries).toBe(150);
      expect(debugInfo.keys.length).toBe(100);
    });
  });
  
  describe('exportSnapshot & importSnapshot', () => {
    it('should export and import cache state', async () => {
      // Setup initial cache state
      await cacheStore.set('key1', { data: 'value1' });
      await cacheStore.set('key2', { data: 'value2' });
      
      // Export snapshot
      const snapshot = await cacheManager.exportSnapshot();
      
      expect(snapshot).toEqual({
        key1: { data: 'value1' },
        key2: { data: 'value2' }
      });
      
      // Clear cache
      await cacheStore.clear();
      expect(await cacheStore.size()).toBe(0);
      
      // Import snapshot
      await cacheManager.importSnapshot(snapshot);
      
      // Verify restored state
      expect(await cacheStore.get('key1')).toEqual({ data: 'value1' });
      expect(await cacheStore.get('key2')).toEqual({ data: 'value2' });
    });
  });
  
  describe('monitorPerformance', () => {
    it('should collect performance metrics over time', async () => {
      // Record some initial stats
      statsCollector.recordHit();
      statsCollector.recordHit();
      statsCollector.recordMiss();
      statsCollector.recordResponseTime(10);
      statsCollector.recordResponseTime(20);
      
      // Monitor for a short duration
      const metrics = await cacheManager.monitorPerformance(100);
      
      expect(metrics.avgHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.avgHitRate).toBeLessThanOrEqual(100);
      expect(metrics.avgResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.peakMemoryUsage).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle empty cache gracefully', async () => {
      const result = await cacheManager.verifyConsistency(10, async () => ({ _id: '1' } as any));
      expect(result.consistent).toBe(true);
      expect(result.inconsistencies).toHaveLength(0);
    });
    
    it('should handle malformed cache keys', async () => {
      // Add cache with malformed key
      await cacheStore.set(`flongo:${collectionName}:get:malformed`, { _id: '1' });
      
      const result = await cacheManager.verifyConsistency(10, async () => ({ _id: '1' } as any));
      
      // Should skip malformed keys without crashing
      expect(result.consistent).toBe(true);
    });
    
    it('should detect deep object differences', async () => {
      const cached = {
        _id: '1',
        nested: { a: 1, b: { c: 2 } },
        array: [1, 2, 3]
      };
      
      await cacheStore.set(`flongo:${collectionName}:get:{"id":"1"}`, cached);
      
      const fresh = {
        _id: '1',
        nested: { a: 1, b: { c: 3 } }, // Different nested value
        array: [1, 2, 3]
      };
      
      const result = await cacheManager.verifyConsistency(10, async () => fresh as any);
      
      expect(result.consistent).toBe(false);
      expect(result.inconsistencies).toContain('Document 1 is inconsistent');
    });
  });
});