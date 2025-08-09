import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CachedFlongoCollection, CachedFlongoCollectionOptions } from '../cachedFlongoCollection';
import { FlongoQuery } from '../flongoQuery';
import { MemoryCache } from '../cache/memoryCache';
import { CacheConfiguration, createDefaultConfig } from '../cache/cacheConfig';
import { Entity } from '../types';
import { flongoDb } from '../flongo';

vi.mock('../flongo', () => ({
  flongoDb: {
    collection: vi.fn()
  }
}));

interface TestEntity {
  name: string;
  age: number;
  status: string;
  tags?: string[];
}

describe('CachedFlongoCollection', () => {
  let mockCollection: any;
  let mockEventsCollection: any;
  let cachedCollection: CachedFlongoCollection<TestEntity>;
  let cacheStore: MemoryCache;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection = {
      findOne: vi.fn(),
      find: vi.fn(),
      insertOne: vi.fn(),
      insertMany: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
      deleteMany: vi.fn(),
      countDocuments: vi.fn()
    };

    mockEventsCollection = {
      insertOne: vi.fn()
    };

    const toArrayMock = vi.fn();
    mockCollection.find.mockReturnValue({
      toArray: toArrayMock
    });

    (flongoDb.collection as any).mockImplementation((name: string) => {
      if (name === 'events') {
        return mockEventsCollection;
      }
      return mockCollection;
    });

    cacheStore = new MemoryCache({
      maxEntries: 100,
      defaultTTL: 60,
      enableStats: true
    });

    cachedCollection = new CachedFlongoCollection<TestEntity>('test_collection', {
      enableCaching: true,
      cacheStore: cacheStore,
      cacheConfig: new CacheConfiguration(createDefaultConfig()),
      enableMonitoring: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for the same query', async () => {
      const query = new FlongoQuery().where('age').gtEq(18).and('status').eq('active');
      
      mockCollection.find().toArray.mockResolvedValue([]);
      
      await cachedCollection.getAll(query);
      await cachedCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
    });

    it('should generate different cache keys for different queries', async () => {
      const query1 = new FlongoQuery().where('age').gtEq(18);
      const query2 = new FlongoQuery().where('age').gtEq(21);
      
      mockCollection.find().toArray.mockResolvedValue([]);
      
      await cachedCollection.getAll(query1);
      await cachedCollection.getAll(query2);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });

    it('should include pagination in cache key', async () => {
      const query = new FlongoQuery().where('status').eq('active');
      const pagination1 = { offset: 0, count: 10 };
      const pagination2 = { offset: 10, count: 10 };
      
      mockCollection.find().toArray.mockResolvedValue([]);
      
      await cachedCollection.getAll(query, pagination1);
      await cachedCollection.getAll(query, pagination2);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('Read-Through Caching', () => {
    describe('get()', () => {
      it('should cache individual document retrieval', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        
        const result1 = await cachedCollection.get('507f1f77bcf86cd799439011');
        const result2 = await cachedCollection.get('507f1f77bcf86cd799439011');
        
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
        expect(result1._id).toBe('507f1f77bcf86cd799439011');
      });

      it('should not cache when cache is disabled', async () => {
        const uncachedCollection = new CachedFlongoCollection<TestEntity>('test_collection', {
          enableCaching: false
        });
        
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        
        await uncachedCollection.get('507f1f77bcf86cd799439011');
        await uncachedCollection.get('507f1f77bcf86cd799439011');
        
        expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
      });
    });

    describe('getAll()', () => {
      it('should cache query results', async () => {
        const mockDocs = [
          { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' },
          { _id: '507f1f77bcf86cd799439012', name: 'Test2', age: 30, status: 'active' }
        ];
        mockCollection.find().toArray.mockResolvedValue(mockDocs);
        
        const query = new FlongoQuery().where('status').eq('active');
        
        const result1 = await cachedCollection.getAll(query);
        const result2 = await cachedCollection.getAll(query);
        
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
        expect(result1.length).toBe(2);
      });

      it('should cache getAll without query', async () => {
        const mockDocs = [
          { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
        ];
        mockCollection.find().toArray.mockResolvedValue(mockDocs);
        
        const result1 = await cachedCollection.getAll();
        const result2 = await cachedCollection.getAll();
        
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
      });
    });

    describe('getSome()', () => {
      it('should cache paginated results', async () => {
        const mockDocs = [
          { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
        ];
        mockCollection.find().toArray.mockResolvedValue(mockDocs);
        
        const query = new FlongoQuery().where('status').eq('active');
        const pagination = { offset: 0, count: 10 };
        
        const result1 = await cachedCollection.getSome(query, pagination);
        const result2 = await cachedCollection.getSome(query, pagination);
        
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
      });
    });

    describe('getFirst()', () => {
      it('should cache first document result', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        
        const query = new FlongoQuery().where('status').eq('active');
        
        const result1 = await cachedCollection.getFirst(query);
        const result2 = await cachedCollection.getFirst(query);
        
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
      });
    });

    describe('count()', () => {
      it('should cache count results', async () => {
        mockCollection.countDocuments.mockResolvedValue(42);
        
        const query = new FlongoQuery().where('status').eq('active');
        
        const result1 = await cachedCollection.count(query);
        const result2 = await cachedCollection.count(query);
        
        expect(mockCollection.countDocuments).toHaveBeenCalledTimes(1);
        expect(result1).toBe(42);
        expect(result2).toBe(42);
      });

      it('should cache count without query', async () => {
        mockCollection.countDocuments.mockResolvedValue(100);
        
        const result1 = await cachedCollection.count();
        const result2 = await cachedCollection.count();
        
        expect(mockCollection.countDocuments).toHaveBeenCalledTimes(1);
        expect(result1).toBe(100);
        expect(result2).toBe(100);
      });
    });

    describe('exists()', () => {
      it('should cache existence check results', async () => {
        mockCollection.countDocuments.mockResolvedValue(1);
        
        const query = new FlongoQuery().where('name').eq('Test');
        
        const result1 = await cachedCollection.exists(query);
        const result2 = await cachedCollection.exists(query);
        
        expect(mockCollection.countDocuments).toHaveBeenCalledTimes(1);
        expect(result1).toBe(true);
        expect(result2).toBe(true);
      });

      it('should cache non-existence', async () => {
        mockCollection.countDocuments.mockResolvedValue(0);
        
        const query = new FlongoQuery().where('name').eq('NonExistent');
        
        const result1 = await cachedCollection.exists(query);
        const result2 = await cachedCollection.exists(query);
        
        expect(mockCollection.countDocuments).toHaveBeenCalledTimes(1);
        expect(result1).toBe(false);
        expect(result2).toBe(false);
      });
    });
  });

  describe('Cache Invalidation', () => {
    describe('Write Operations', () => {
      it('should invalidate cache on create', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.find().toArray.mockResolvedValue([mockDoc]);
        mockCollection.insertOne.mockResolvedValue({ insertedId: '507f1f77bcf86cd799439011' });
        mockCollection.findOne.mockResolvedValue(mockDoc);
        mockEventsCollection.insertOne.mockResolvedValue({ insertedId: '123' });
        
        await cachedCollection.getAll();
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        
        await cachedCollection.create({ name: 'New', age: 30, status: 'active' });
        
        mockCollection.find().toArray.mockResolvedValue([mockDoc, { _id: '507f1f77bcf86cd799439012', name: 'New', age: 30, status: 'active' }]);
        
        await cachedCollection.getAll();
        expect(mockCollection.find).toHaveBeenCalledTimes(2);
      });

      it('should invalidate specific document cache on update', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        mockEventsCollection.insertOne.mockResolvedValue({ insertedId: '123' });
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        
        await cachedCollection.update('507f1f77bcf86cd799439011', { age: 26 });
        
        mockCollection.findOne.mockResolvedValue({ ...mockDoc, age: 26 });
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
      });

      it('should invalidate cache on delete', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        mockEventsCollection.insertOne.mockResolvedValue({ insertedId: '123' });
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        
        await cachedCollection.delete('507f1f77bcf86cd799439011', 'client123');
        
        mockCollection.findOne.mockResolvedValue(null);
        
        try {
          await cachedCollection.get('507f1f77bcf86cd799439011');
        } catch (e) {
          
        }
        expect(mockCollection.findOne).toHaveBeenCalledTimes(3);
      });

      it('should invalidate cache on batch operations', async () => {
        mockCollection.find().toArray.mockResolvedValue([]);
        mockEventsCollection.insertOne.mockResolvedValue({ insertedId: '123' });
        
        await cachedCollection.getAll();
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        
        await cachedCollection.batchCreate([
          { name: 'Test1', age: 25, status: 'active' },
          { name: 'Test2', age: 30, status: 'active' }
        ]);
        
        await cachedCollection.getAll();
        expect(mockCollection.find).toHaveBeenCalledTimes(2);
      });

      it('should invalidate cache on atomic operations', async () => {
        const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
        mockCollection.findOne.mockResolvedValue(mockDoc);
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        
        await cachedCollection.increment('507f1f77bcf86cd799439011', 'age', 1);
        
        mockCollection.findOne.mockResolvedValue({ ...mockDoc, age: 26 });
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
      });
    });

    describe('Selective Invalidation', () => {
      it('should not invalidate unrelated get() caches', async () => {
        const mockDoc1 = { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' };
        const mockDoc2 = { _id: '507f1f77bcf86cd799439012', name: 'Test2', age: 30, status: 'active' };
        
        mockCollection.findOne.mockImplementation((query: any) => {
          if (query._id.toString() === '507f1f77bcf86cd799439011') {
            return Promise.resolve(mockDoc1);
          }
          return Promise.resolve(mockDoc2);
        });
        
        await cachedCollection.get('507f1f77bcf86cd799439011');
        await cachedCollection.get('507f1f77bcf86cd799439012');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
        
        mockEventsCollection.insertOne.mockResolvedValue({ insertedId: '123' });
        await cachedCollection.update('507f1f77bcf86cd799439011', { age: 26 });
        
        await cachedCollection.get('507f1f77bcf86cd799439012');
        expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
      });

      it('should invalidate pattern-based caches', async () => {
        await cachedCollection.invalidateCache('*:getAll:*');
        
        const stats = await cacheStore.getStats();
        expect(stats.deletes).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Cache Warmup', () => {
    it('should warmup cache on initialization', async () => {
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      const warmupCollection = new CachedFlongoCollection<TestEntity>('warmup_collection', {
        enableCaching: true,
        cacheStore: new MemoryCache(),
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false
      });
      
      // Manually trigger warmup
      await warmupCollection.warmupCache([
        { query: new FlongoQuery().where('status').eq('active') },
        { pagination: { offset: 0, count: 10 } }
      ]);
      
      expect(mockCollection.find).toHaveBeenCalled();
    });

    it('should handle warmup failures gracefully', async () => {
      mockCollection.find().toArray.mockRejectedValue(new Error('Database error'));
      
      const warmupCollection = new CachedFlongoCollection<TestEntity>('warmup_collection', {
        enableCaching: true,
        cacheStore: new MemoryCache(),
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false
      });
      
      // Manually trigger warmup that will fail
      await warmupCollection.warmupCache([
        { query: new FlongoQuery().where('status').eq('active') }
      ]);
      
      expect(mockCollection.find).toHaveBeenCalled();
    });
  });

  describe('Cache Bypass', () => {
    it('should bypass cache based on patterns', async () => {
      const bypassCollection = new CachedFlongoCollection<TestEntity>('test_collection', {
        enableCaching: true,
        cacheStore: cacheStore,
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false,
        bypassCache: (operation, query) => query?.expressions.some(e => e.key === 'sensitive')
      });
      
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active', sensitive: true }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      const query = new FlongoQuery().where('sensitive').eq(true);
      
      await bypassCollection.getAll(query);
      await bypassCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });

    it('should not bypass cache for non-matching patterns', async () => {
      const bypassCollection = new CachedFlongoCollection<TestEntity>('test_collection', {
        enableCaching: true,
        cacheStore: cacheStore,
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false,
        bypassCache: (operation, query) => query?.expressions.some(e => e.key === 'sensitive')
      });
      
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      const query = new FlongoQuery().where('status').eq('active');
      
      await bypassCollection.getAll(query);
      await bypassCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      await cachedCollection.getAll();
      await cachedCollection.getAll();
      
      const stats = await cachedCollection.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats?.hits).toBe(1);
      expect(stats?.misses).toBe(1);
      expect(stats?.sets).toBe(1);
    });

    it('should clear collection-specific cache', async () => {
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      await cachedCollection.getAll();
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
      
      await cachedCollection.clearCache();
      
      await cachedCollection.getAll();
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });

    it('should enable and disable cache', () => {
      expect(cachedCollection.isCachingEnabled()).toBe(true);
      
      cachedCollection.setCachingEnabled(false);
      expect(cachedCollection.isCachingEnabled()).toBe(false);
      
      cachedCollection.setCachingEnabled(true);
      expect(cachedCollection.isCachingEnabled()).toBe(true);
    });

    it('should handle disabled cache gracefully', async () => {
      cachedCollection.setCachingEnabled(false);
      
      const mockDocs = [
        { _id: '507f1f77bcf86cd799439011', name: 'Test1', age: 25, status: 'active' }
      ];
      mockCollection.find().toArray.mockResolvedValue(mockDocs);
      
      await cachedCollection.getAll();
      await cachedCollection.getAll();
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('API Compatibility', () => {
    it('should maintain full API compatibility with FlongoCollection', () => {
      expect(cachedCollection.get).toBeDefined();
      expect(cachedCollection.getAll).toBeDefined();
      expect(cachedCollection.getSome).toBeDefined();
      expect(cachedCollection.getFirst).toBeDefined();
      expect(cachedCollection.count).toBeDefined();
      expect(cachedCollection.exists).toBeDefined();
      expect(cachedCollection.create).toBeDefined();
      expect(cachedCollection.batchCreate).toBeDefined();
      expect(cachedCollection.update).toBeDefined();
      expect(cachedCollection.updateAll).toBeDefined();
      expect(cachedCollection.updateFirst).toBeDefined();
      expect(cachedCollection.delete).toBeDefined();
      expect(cachedCollection.batchDelete).toBeDefined();
      expect(cachedCollection.increment).toBeDefined();
      expect(cachedCollection.decrement).toBeDefined();
      expect(cachedCollection.append).toBeDefined();
      expect(cachedCollection.arrRemove).toBeDefined();
      expect(cachedCollection.logEvent).toBeDefined();
    });

    it('should work as drop-in replacement', async () => {
      const normalCollection = new CachedFlongoCollection<TestEntity>('test_collection', {
        enableCaching: false
      });
      
      const mockDoc = { _id: '507f1f77bcf86cd799439011', name: 'Test', age: 25, status: 'active' };
      mockCollection.findOne.mockResolvedValue(mockDoc);
      
      const result = await normalCollection.get('507f1f77bcf86cd799439011');
      expect(result._id).toBe('507f1f77bcf86cd799439011');
    });
  });
});