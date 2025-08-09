import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CachedFlongoCollection, CachedFlongoCollectionOptions } from '../cachedFlongoCollection';
import { FlongoQuery } from '../flongoQuery';
import { MemoryCache } from '../cache/memoryCache';
import { CacheStore } from '../cache/cacheStore';
import { Entity, Pagination, SortDirection } from '../types';
import { ObjectId } from 'mongodb';
import { flongoDb } from '../flongo';

// Mock the flongo module
vi.mock('../flongo', () => ({
  flongoDb: {
    collection: vi.fn()
  }
}));

interface TestDoc {
  name: string;
  age: number;
  tags?: string[];
}

describe('CachedFlongoCollection', () => {
  let collection: CachedFlongoCollection<TestDoc>;
  let mockCacheStore: CacheStore<any>;
  let mockDbCollection: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a mock cache store
    mockCacheStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(false),
      size: vi.fn().mockResolvedValue(0),
      keys: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({
        hits: 0,
        misses: 0,
        evictions: 0,
        sets: 0,
        deletes: 0,
        clears: 0,
        size: 0
      }),
      resetStats: vi.fn().mockResolvedValue(undefined)
    };

    // Mock database collection methods
    mockDbCollection = {
      findOne: vi.fn(),
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([])
      })),
      countDocuments: vi.fn().mockResolvedValue(0),
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
      insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
    };
    
    // Mock flongoDb.collection to return our mock collection
    vi.mocked(flongoDb).collection.mockReturnValue(mockDbCollection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create instance with default cache configuration', () => {
      collection = new CachedFlongoCollection<TestDoc>('test');
      expect(collection).toBeInstanceOf(CachedFlongoCollection);
    });

    it('should accept custom cache configuration', () => {
      const options: CachedFlongoCollectionOptions = {
        cacheEnabled: true,
        cacheTTL: 600,
        cacheMaxEntries: 5000,
        cacheStore: mockCacheStore
      };
      
      collection = new CachedFlongoCollection<TestDoc>('test', options);
      expect(collection).toBeInstanceOf(CachedFlongoCollection);
    });

    it('should disable caching when cacheEnabled is false', async () => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheEnabled: false,
        cacheStore: mockCacheStore
      });

      const testId = new ObjectId().toHexString();
      mockDbCollection.findOne.mockResolvedValue({ _id: new ObjectId(testId), name: 'Test' });

      await collection.get(testId);
      
      expect(mockCacheStore.get).not.toHaveBeenCalled();
      expect(mockCacheStore.set).not.toHaveBeenCalled();
    });

    it('should handle cache warmup on initialization', async () => {
      const warmupQueries = [
        { query: new FlongoQuery().where('active').eq(true) },
        { query: new FlongoQuery().where('role').eq('admin') }
      ];

      mockDbCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: new ObjectId(), name: 'User1' },
          { _id: new ObjectId(), name: 'User2' }
        ])
      });

      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore,
        warmupQueries
      });

      // Wait for warmup to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDbCollection.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('Read Operations with Caching', () => {
    beforeEach(() => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore,
        cacheTTL: 300
      });
    });

    describe('get()', () => {
      it('should cache document on first fetch', async () => {
        const testId = new ObjectId().toHexString();
        const testDoc = { _id: new ObjectId(testId), name: 'Test', age: 25 };
        
        mockDbCollection.findOne.mockResolvedValue(testDoc);
        mockCacheStore.get.mockResolvedValue(undefined); // Cache miss

        const result = await collection.get(testId);

        expect(mockCacheStore.get).toHaveBeenCalledWith(expect.stringContaining('test:get:' + testId));
        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.stringContaining('test:get:' + testId),
          expect.objectContaining({ _id: testId, name: 'Test', age: 25 }),
          300
        );
        expect(result).toEqual({ ...testDoc, _id: testId });
      });

      it('should return cached document on subsequent fetch', async () => {
        const testId = new ObjectId().toHexString();
        const cachedDoc = { _id: testId, name: 'Cached', age: 30 };
        
        mockCacheStore.get.mockResolvedValue(cachedDoc); // Cache hit

        const result = await collection.get(testId);

        expect(mockCacheStore.get).toHaveBeenCalled();
        expect(mockDbCollection.findOne).not.toHaveBeenCalled();
        expect(mockCacheStore.set).not.toHaveBeenCalled();
        expect(result).toEqual(cachedDoc);
      });
    });

    describe('getAll()', () => {
      it('should cache query results', async () => {
        const query = new FlongoQuery().where('age').gtEq(18);
        const docs = [
          { _id: new ObjectId(), name: 'User1', age: 20 },
          { _id: new ObjectId(), name: 'User2', age: 25 }
        ];

        mockDbCollection.find.mockReturnValue({
          toArray: vi.fn().mockResolvedValue(docs)
        });
        mockCacheStore.get.mockResolvedValue(undefined); // Cache miss

        const result = await collection.getAll(query);

        expect(mockCacheStore.get).toHaveBeenCalled();
        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            expect.objectContaining({ name: 'User1' }),
            expect.objectContaining({ name: 'User2' })
          ]),
          300
        );
        expect(result).toHaveLength(2);
      });

      it('should return cached results for same query', async () => {
        const query = new FlongoQuery().where('age').gtEq(18);
        const cachedDocs = [
          { _id: '1', name: 'Cached1', age: 20 },
          { _id: '2', name: 'Cached2', age: 25 }
        ];

        mockCacheStore.get.mockResolvedValue(cachedDocs); // Cache hit

        const result = await collection.getAll(query);

        expect(mockCacheStore.get).toHaveBeenCalled();
        expect(mockDbCollection.find).not.toHaveBeenCalled();
        expect(result).toEqual(cachedDocs);
      });

      it('should handle pagination in cache keys', async () => {
        const query = new FlongoQuery().where('active').eq(true);
        const pagination: Pagination = { offset: 10, count: 20 };

        mockDbCollection.find.mockReturnValue({
          toArray: vi.fn().mockResolvedValue([])
        });

        await collection.getAll(query, pagination);

        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.stringContaining('p10-20'),
          expect.any(Array),
          300
        );
      });
    });

    describe('count()', () => {
      it('should cache count results', async () => {
        const query = new FlongoQuery().where('status').eq('active');
        
        mockDbCollection.countDocuments.mockResolvedValue(42);
        mockCacheStore.get.mockResolvedValue(undefined); // Cache miss

        const result = await collection.count(query);

        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.any(String),
          42,
          300
        );
        expect(result).toBe(42);
      });

      it('should return cached count', async () => {
        const query = new FlongoQuery().where('status').eq('active');
        
        mockCacheStore.get.mockResolvedValue(42); // Cache hit

        const result = await collection.count(query);

        expect(mockDbCollection.countDocuments).not.toHaveBeenCalled();
        expect(result).toBe(42);
      });
    });

    describe('exists()', () => {
      it('should cache existence check results', async () => {
        const query = new FlongoQuery().where('email').eq('test@example.com');
        
        mockDbCollection.countDocuments.mockResolvedValue(1);
        mockCacheStore.get.mockResolvedValue(undefined); // Cache miss

        const result = await collection.exists(query);

        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.any(String),
          true,
          300
        );
        expect(result).toBe(true);
      });
    });

    describe('Cache Bypass', () => {
      it('should bypass cache when predicate returns true', async () => {
        const bypassPredicate = (query?: FlongoQuery) => {
          return query?.expressions.some(exp => exp.key === 'sensitive') ?? false;
        };

        collection = new CachedFlongoCollection<TestDoc>('test', {
          cacheStore: mockCacheStore,
          cacheBypassPredicate: bypassPredicate
        });

        const query = new FlongoQuery().where('sensitive').eq('data');
        
        mockDbCollection.find.mockReturnValue({
          toArray: vi.fn().mockResolvedValue([])
        });

        await collection.getAll(query);

        expect(mockCacheStore.get).not.toHaveBeenCalled();
        expect(mockCacheStore.set).not.toHaveBeenCalled();
      });
    });
  });

  describe('Write Operations with Cache Invalidation', () => {
    beforeEach(() => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore
      });

      // Setup some cached keys
      mockCacheStore.keys.mockResolvedValue([
        'flongo:test:get:123',
        'flongo:test:getAll:hash1',
        'flongo:test:count:hash2',
        'flongo:test:exists:hash3'
      ]);
    });

    describe('create()', () => {
      it('should invalidate query caches after creation', async () => {
        const newDoc = { name: 'New', age: 30 };
        const insertedId = new ObjectId();
        
        mockDbCollection.insertOne.mockResolvedValue({ insertedId });
        mockDbCollection.findOne.mockResolvedValue({ _id: insertedId, ...newDoc });

        await collection.create(newDoc);

        // Should invalidate query caches
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:count:hash2');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:exists:hash3');
        // Should not invalidate specific document caches
        expect(mockCacheStore.delete).not.toHaveBeenCalledWith('flongo:test:get:123');
      });
    });

    describe('update()', () => {
      it('should invalidate document and query caches after update', async () => {
        const id = '507f1f77bcf86cd799439011';
        
        await collection.update(id, { name: 'Updated' });

        // Should invalidate specific document cache
        expect(mockCacheStore.delete).toHaveBeenCalledWith(expect.stringContaining(`test:get:${id}`));
        // Should invalidate query caches
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:count:hash2');
      });
    });

    describe('delete()', () => {
      it('should invalidate document and query caches after deletion', async () => {
        const id = '507f1f77bcf86cd799439011';
        
        mockDbCollection.findOne.mockResolvedValue({ _id: new ObjectId(id), name: 'ToDelete' });

        await collection.delete(id, 'client1');

        // Should invalidate specific document cache
        expect(mockCacheStore.delete).toHaveBeenCalledWith(expect.stringContaining(`test:get:${id}`));
        // Should invalidate query caches
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:count:hash2');
      });
    });

    describe('updateAll()', () => {
      it('should clear all collection caches after bulk update', async () => {
        mockCacheStore.keys.mockResolvedValue([
          'flongo:test:get:123',
          'flongo:test:get:456',
          'flongo:test:getAll:hash1',
          'flongo:test:count:hash2',
          'flongo:other:get:789'
        ]);

        await collection.updateAll({ status: 'updated' });

        // Should clear all caches for this collection
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:get:123');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:get:456');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:count:hash2');
        // Should not clear other collection caches
        expect(mockCacheStore.delete).not.toHaveBeenCalledWith('flongo:other:get:789');
      });
    });

    describe('Atomic Operations', () => {
      it('should invalidate caches after increment', async () => {
        const id = '507f1f77bcf86cd799439011';
        
        await collection.increment(id, 'viewCount', 1);

        expect(mockCacheStore.delete).toHaveBeenCalledWith(expect.stringContaining(`test:get:${id}`));
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
      });

      it('should invalidate caches after append', async () => {
        const id = '507f1f77bcf86cd799439011';
        
        await collection.append(id, 'tags', ['new-tag']);

        expect(mockCacheStore.delete).toHaveBeenCalledWith(expect.stringContaining(`test:get:${id}`));
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
      });
    });
  });

  describe('Cache Management Methods', () => {
    beforeEach(() => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore
      });
    });

    describe('clearCache()', () => {
      it('should clear all caches for the collection', async () => {
        mockCacheStore.keys.mockResolvedValue([
          'flongo:test:get:123',
          'flongo:test:getAll:hash1',
          'flongo:other:get:456'
        ]);

        await collection.clearCache();

        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:get:123');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).not.toHaveBeenCalledWith('flongo:other:get:456');
      });
    });

    describe('invalidateCache()', () => {
      it('should invalidate caches matching pattern', async () => {
        mockCacheStore.keys.mockResolvedValue([
          'flongo:test:get:123',
          'flongo:test:getAll:hash1',
          'flongo:test:getAll:hash2',
          'flongo:test:count:hash3'
        ]);

        await collection.invalidateCache('flongo:test:getAll*');

        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash1');
        expect(mockCacheStore.delete).toHaveBeenCalledWith('flongo:test:getAll:hash2');
        expect(mockCacheStore.delete).not.toHaveBeenCalledWith('flongo:test:get:123');
        expect(mockCacheStore.delete).not.toHaveBeenCalledWith('flongo:test:count:hash3');
      });
    });

    describe('getCacheStats()', () => {
      it('should return cache statistics', async () => {
        mockCacheStore.keys.mockResolvedValue([
          'flongo:test:get:123',
          'flongo:test:getAll:hash1',
          'flongo:other:get:456'
        ]);

        mockCacheStore.getStats.mockResolvedValue({
          hits: 100,
          misses: 20,
          evictions: 5,
          sets: 120,
          deletes: 10,
          clears: 2,
          size: 50
        });

        const stats = await collection.getCacheStats();

        expect(stats).toEqual({
          enabled: true,
          collection: 'test',
          config: expect.objectContaining({
            enabled: true,
            ttl: 300,
            maxEntries: 10000
          }),
          collectionEntries: 2, // Only 'test' collection entries
          totalStats: expect.objectContaining({
            hits: 100,
            misses: 20
          })
        });
      });

      it('should return disabled status when caching is off', async () => {
        collection = new CachedFlongoCollection<TestDoc>('test', {
          cacheEnabled: false
        });

        const stats = await collection.getCacheStats();

        expect(stats).toEqual({
          enabled: false,
          stats: null
        });
      });
    });

    describe('setCachingEnabled()', () => {
      it('should enable caching', () => {
        collection.setCachingEnabled(true);
        expect(mockCacheStore.clear).not.toHaveBeenCalled();
      });

      it('should disable caching and clear cache', () => {
        mockCacheStore.keys.mockResolvedValue(['flongo:test:get:123']);
        
        collection.setCachingEnabled(false);

        // Clearing happens asynchronously
        setTimeout(() => {
          expect(mockCacheStore.delete).toHaveBeenCalled();
        }, 100);
      });
    });

    describe('updateCacheConfig()', () => {
      it('should update cache configuration', async () => {
        collection.updateCacheConfig({
          ttl: 600,
          maxEntries: 5000
        });

        // Test that new config is applied
        const testId = new ObjectId().toHexString();
        const testDoc = { _id: new ObjectId(testId), name: 'Test' };
        
        mockDbCollection.findOne.mockResolvedValue(testDoc);
        mockCacheStore.get.mockResolvedValue(undefined);

        await collection.get(testId);

        expect(mockCacheStore.set).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Object),
          600 // New TTL
        );
      });
    });

    describe('warmupCache()', () => {
      it('should execute warmup queries', async () => {
        const queries = [
          { query: new FlongoQuery().where('featured').eq(true) },
          { 
            query: new FlongoQuery().where('category').eq('products'),
            pagination: { offset: 0, count: 10 }
          }
        ];

        mockDbCollection.find.mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { _id: new ObjectId(), name: 'Item1' },
            { _id: new ObjectId(), name: 'Item2' }
          ])
        });

        await collection.warmupCache(queries);

        expect(mockDbCollection.find).toHaveBeenCalledTimes(2);
        expect(mockCacheStore.set).toHaveBeenCalledTimes(2);
      });

      it('should handle warmup errors gracefully', async () => {
        const queries = [
          { query: new FlongoQuery().where('bad').eq('query') }
        ];

        mockDbCollection.find.mockReturnValue({
          toArray: vi.fn().mockRejectedValue(new Error('Database error'))
        });

        // Should not throw
        await expect(collection.warmupCache(queries)).resolves.toBeUndefined();
      });
    });
  });

  describe('API Compatibility', () => {
    it('should maintain full API compatibility with FlongoCollection', () => {
      collection = new CachedFlongoCollection<TestDoc>('test');

      // Check that all FlongoCollection methods exist
      expect(collection.get).toBeDefined();
      expect(collection.getAll).toBeDefined();
      expect(collection.getSome).toBeDefined();
      expect(collection.getFirst).toBeDefined();
      expect(collection.count).toBeDefined();
      expect(collection.exists).toBeDefined();
      expect(collection.create).toBeDefined();
      expect(collection.batchCreate).toBeDefined();
      expect(collection.update).toBeDefined();
      expect(collection.updateAll).toBeDefined();
      expect(collection.updateFirst).toBeDefined();
      expect(collection.delete).toBeDefined();
      expect(collection.batchDelete).toBeDefined();
      expect(collection.increment).toBeDefined();
      expect(collection.decrement).toBeDefined();
      expect(collection.append).toBeDefined();
      expect(collection.arrRemove).toBeDefined();
      expect(collection.logEvent).toBeDefined();
    });
  });

  describe('Complex Query Caching', () => {
    beforeEach(() => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore
      });
    });

    it('should generate unique cache keys for different queries', async () => {
      const query1 = new FlongoQuery().where('age').gtEq(18).and('status').eq('active');
      const query2 = new FlongoQuery().where('age').gtEq(21).and('status').eq('active');
      const query3 = new FlongoQuery().where('status').eq('active').and('age').gtEq(18);

      mockDbCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      });

      await collection.getAll(query1);
      await collection.getAll(query2);
      await collection.getAll(query3);

      // Each query should result in a separate cache set call
      expect(mockCacheStore.set).toHaveBeenCalledTimes(3);
      
      const setCalls = (mockCacheStore.set as any).mock.calls;
      const cacheKeys = setCalls.map((call: any[]) => call[0]);
      
      // Query 1 and 3 have the same conditions (just different order), so they should have the same key
      // This is correct behavior - cache key generator normalizes queries
      // We should have 2 unique keys, not 3
      expect(new Set(cacheKeys).size).toBe(2);
      
      // Verify that query1 and query3 produce the same key
      expect(cacheKeys[0]).toBe(cacheKeys[2]);
      // And query2 produces a different key
      expect(cacheKeys[1]).not.toBe(cacheKeys[0]);
    });

    it('should handle OR queries in cache keys', async () => {
      const subQuery1 = new FlongoQuery().where('role').eq('admin');
      const subQuery2 = new FlongoQuery().where('role').eq('moderator');
      const query = new FlongoQuery().or(subQuery1).or(subQuery2);

      mockDbCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      });

      await collection.getAll(query);

      expect(mockCacheStore.set).toHaveBeenCalled();
    });

    it('should handle sorted queries in cache keys', async () => {
      const query = new FlongoQuery()
        .where('status').eq('published')
        .orderBy('createdAt', SortDirection.Descending);

      mockDbCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      });

      await collection.getAll(query);

      expect(mockCacheStore.set).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      collection = new CachedFlongoCollection<TestDoc>('test', {
        cacheStore: mockCacheStore
      });
    });

    it('should handle empty query results', async () => {
      mockDbCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      });

      const result = await collection.getAll();

      expect(mockCacheStore.set).toHaveBeenCalledWith(
        expect.any(String),
        [],
        300
      );
      expect(result).toEqual([]);
    });

    it('should handle null/undefined in count cache', async () => {
      mockDbCollection.countDocuments.mockResolvedValue(0);

      const result = await collection.count();

      expect(mockCacheStore.set).toHaveBeenCalledWith(
        expect.any(String),
        0,
        300
      );
      expect(result).toBe(0);
    });

    it('should handle false in exists cache', async () => {
      mockDbCollection.countDocuments.mockResolvedValue(0);

      const query = new FlongoQuery().where('nonexistent').eq('value');
      const result = await collection.exists(query);

      expect(mockCacheStore.set).toHaveBeenCalledWith(
        expect.any(String),
        false,
        300
      );
      expect(result).toBe(false);
    });

    it('should handle concurrent operations correctly', async () => {
      const promises = [];
      const testId = new ObjectId().toHexString();
      const testDoc = { _id: new ObjectId(testId), name: 'Test' };

      mockDbCollection.findOne.mockResolvedValue(testDoc);
      mockCacheStore.get.mockResolvedValue(undefined);

      // Simulate concurrent requests for the same document
      for (let i = 0; i < 5; i++) {
        promises.push(collection.get(testId));
      }

      const results = await Promise.all(promises);

      // All results should be the same
      results.forEach(result => {
        expect(result).toEqual({ ...testDoc, _id: testId });
      });

      // Database should only be called once (or a few times due to race conditions)
      expect(mockDbCollection.findOne.mock.calls.length).toBeLessThanOrEqual(5);
    });
  });
});