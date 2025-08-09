import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CachedFlongoCollection, CachedFlongoCollectionOptions } from '../../cachedFlongoCollection';
import { FlongoQuery } from '../../flongoQuery';
import { MemoryCache } from '../../cache/memoryCache';
import { SortDirection } from '../../types';
import { flongoDb } from '../../flongo';
import { CacheConfiguration, createDefaultConfig, createProductionConfig } from '../../cache/cacheConfig';

vi.mock('../../flongo', () => ({
  flongoDb: {
    collection: vi.fn()
  }
}));

interface Product {
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  tags: string[];
  rating: number;
  reviews: number;
}

describe('Caching Integration Tests', () => {
  let mockCollection: any;
  let mockEventsCollection: any;
  let productCollection: CachedFlongoCollection<Product>;
  let cacheStore: MemoryCache;

  const createMockProduct = (id: string, overrides: Partial<Product> = {}): any => ({
    _id: id,
    name: `Product ${id}`,
    price: 99.99,
    category: 'electronics',
    inStock: true,
    tags: ['featured', 'new'],
    rating: 4.5,
    reviews: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  });

  beforeEach(() => {
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
      maxEntries: 1000,
      defaultTTL: 300,
      enableStats: true
    });

    productCollection = new CachedFlongoCollection<Product>('products', {
      enableCaching: true,
      cacheStore: cacheStore,
      cacheConfig: new CacheConfiguration(createDefaultConfig()),
      enableMonitoring: false
    });

    mockEventsCollection.insertOne.mockResolvedValue({ insertedId: 'event-id' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complex Query Caching', () => {
    it('should cache complex multi-field queries', async () => {
      const products = [
        createMockProduct('1', { category: 'electronics', price: 199.99, inStock: true }),
        createMockProduct('2', { category: 'electronics', price: 299.99, inStock: true })
      ];
      
      mockCollection.find().toArray.mockResolvedValue(products);
      
      const query = new FlongoQuery()
        .where('category').eq('electronics')
        .and('price').ltEq(300)
        .and('inStock').eq(true)
        .orderBy('price', SortDirection.Ascending);
      
      const result1 = await productCollection.getAll(query);
      const result2 = await productCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
      
      const stats = await cacheStore.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should cache OR queries correctly', async () => {
      const products = [
        createMockProduct('1', { category: 'electronics' }),
        createMockProduct('2', { category: 'furniture' })
      ];
      
      mockCollection.find().toArray.mockResolvedValue(products);
      
      const query = new FlongoQuery()
        .where('category').eq('electronics')
        .or(new FlongoQuery().where('category').eq('furniture'));
      
      const result1 = await productCollection.getAll(query);
      const result2 = await productCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should cache array queries', async () => {
      const products = [
        createMockProduct('1', { tags: ['featured', 'sale'] }),
        createMockProduct('2', { tags: ['featured', 'new'] })
      ];
      
      mockCollection.find().toArray.mockResolvedValue(products);
      
      const query = new FlongoQuery()
        .where('tags').arrContainsAny(['featured', 'sale']);
      
      const result1 = await productCollection.getAll(query);
      const result2 = await productCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should cache range queries', async () => {
      const products = [
        createMockProduct('1', { price: 50 }),
        createMockProduct('2', { price: 150 }),
        createMockProduct('3', { price: 250 })
      ];
      
      mockCollection.find().toArray.mockResolvedValue([products[1]]);
      
      const query = new FlongoQuery().inRange('price', 100, 200);
      
      const result1 = await productCollection.getAll(query);
      const result2 = await productCollection.getAll(query);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
      expect(result1.length).toBe(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads efficiently', async () => {
      const product = createMockProduct('1');
      mockCollection.findOne.mockResolvedValue(product);
      
      const promises = Array.from({ length: 10 }, () => 
        productCollection.get('1')
      );
      
      const results = await Promise.all(promises);
      
      expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
      expect(results.every(r => r._id === '1')).toBe(true);
    });

    it('should handle concurrent writes with proper invalidation', async () => {
      const products = [createMockProduct('1')];
      mockCollection.find().toArray.mockResolvedValue(products);
      mockCollection.countDocuments.mockResolvedValue(1);
      
      await productCollection.getAll();
      
      const updatePromises = Array.from({ length: 5 }, (_, i) => 
        productCollection.update(`${i + 1}`, { price: 100 + i })
      );
      
      await Promise.all(updatePromises);
      
      mockCollection.find().toArray.mockResolvedValue([
        createMockProduct('1', { price: 100 })
      ]);
      
      const result = await productCollection.getAll();
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('Production Configuration', () => {
    it('should work with production config', async () => {
      const prodCollection = new CachedFlongoCollection<Product>('products', {
        enableCaching: true,
        cacheStore: new MemoryCache({
          maxEntries: 10000,
          defaultTTL: 3600,
          enableStats: true
        }),
        cacheConfig: new CacheConfiguration(createProductionConfig()),
        enableMonitoring: false
      });
      
      const product = createMockProduct('1');
      mockCollection.findOne.mockResolvedValue(product);
      
      const result = await prodCollection.get('1');
      expect(result._id).toBe('1');
    });
  });

  describe('Cache Warmup Scenarios', () => {
    it('should warmup frequently accessed queries', async () => {
      const featuredProducts = [
        createMockProduct('1', { tags: ['featured'] }),
        createMockProduct('2', { tags: ['featured'] })
      ];
      
      const bestSellers = [
        createMockProduct('3', { tags: ['bestseller'] }),
        createMockProduct('4', { tags: ['bestseller'] })
      ];
      
      mockCollection.find.mockImplementation(() => ({
        toArray: vi.fn().mockImplementation(() => {
          const filter = mockCollection.find.mock.calls[mockCollection.find.mock.calls.length - 1][0];
          if (filter?.tags?.$in?.includes('featured')) {
            return Promise.resolve(featuredProducts);
          }
          if (filter?.tags?.$in?.includes('bestseller')) {
            return Promise.resolve(bestSellers);
          }
          return Promise.resolve([]);
        })
      }));
      
      const warmupCollection = new CachedFlongoCollection<Product>('products', {
        enableCaching: true,
        cacheStore: new MemoryCache(),
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false
      });
      
      // Manually trigger warmup
      await warmupCollection.warmupCache([
        { query: new FlongoQuery().where('tags').arrContainsAny(['featured']) },
        { query: new FlongoQuery().where('tags').arrContainsAny(['bestseller']) }
      ]);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
      
      const featured = await warmupCollection.getAll(
        new FlongoQuery().where('tags').arrContainsAny(['featured'])
      );
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
      expect(featured.length).toBe(2);
    });
  });

  describe('Cache Invalidation Patterns', () => {
    it('should invalidate related queries on updates', async () => {
      const electronicProducts = [
        createMockProduct('1', { category: 'electronics', price: 100 }),
        createMockProduct('2', { category: 'electronics', price: 200 })
      ];
      
      mockCollection.find().toArray.mockResolvedValue(electronicProducts);
      mockCollection.countDocuments.mockResolvedValue(2);
      
      const query1 = new FlongoQuery().where('category').eq('electronics');
      const query2 = new FlongoQuery().where('category').eq('electronics').and('price').lt(150);
      
      await productCollection.getAll(query1);
      await productCollection.getAll(query2);
      await productCollection.count(query1);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(2);
      expect(mockCollection.countDocuments).toHaveBeenCalledTimes(1);
      
      mockCollection.findOne.mockResolvedValue(electronicProducts[0]);
      await productCollection.update('1', { price: 110 });
      
      mockCollection.find().toArray.mockResolvedValue([
        createMockProduct('1', { category: 'electronics', price: 110 }),
        electronicProducts[1]
      ]);
      mockCollection.countDocuments.mockResolvedValue(2);
      
      await productCollection.getAll(query1);
      await productCollection.getAll(query2);
      await productCollection.count(query1);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(4);
      expect(mockCollection.countDocuments).toHaveBeenCalledTimes(2);
    });

    it('should handle selective cache invalidation', async () => {
      const product1 = createMockProduct('1');
      const product2 = createMockProduct('2');
      
      mockCollection.findOne.mockImplementation((query: any) => {
        if (query._id.toString() === '1') return Promise.resolve(product1);
        if (query._id.toString() === '2') return Promise.resolve(product2);
        return Promise.resolve(null);
      });
      
      await productCollection.get('1');
      await productCollection.get('2');
      
      expect(mockCollection.findOne).toHaveBeenCalledTimes(2);
      
      await productCollection.update('1', { price: 150 });
      
      await productCollection.get('1');
      await productCollection.get('2');
      
      expect(mockCollection.findOne).toHaveBeenCalledTimes(3);
    });
  });

  describe('Memory Management', () => {
    it('should respect max entries limit', async () => {
      const limitedCache = new MemoryCache({
        maxEntries: 3,
        defaultTTL: 300,
        enableStats: true
      });
      
      const limitedCollection = new CachedFlongoCollection<Product>('products', {
        enableCaching: true,
        cacheStore: limitedCache,
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false
      });
      
      for (let i = 1; i <= 5; i++) {
        mockCollection.findOne.mockResolvedValue(createMockProduct(String(i)));
        await limitedCollection.get(String(i));
      }
      
      const stats = await limitedCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockCollection.find().toArray.mockRejectedValue(new Error('Database connection lost'));
      
      await expect(productCollection.getAll()).rejects.toThrow('Database connection lost');
      
      mockCollection.find().toArray.mockResolvedValue([createMockProduct('1')]);
      
      const result = await productCollection.getAll();
      expect(result.length).toBe(1);
    });

    it('should continue working when cache fails', async () => {
      const faultyCache = {
        get: vi.fn().mockRejectedValue(new Error('Cache error')),
        set: vi.fn().mockRejectedValue(new Error('Cache error')),
        delete: vi.fn().mockRejectedValue(new Error('Cache error')),
        clear: vi.fn().mockRejectedValue(new Error('Cache error')),
        has: vi.fn().mockRejectedValue(new Error('Cache error')),
        size: vi.fn().mockResolvedValue(0),
        keys: vi.fn().mockResolvedValue([]),
        getStats: vi.fn().mockResolvedValue({
          hits: 0, misses: 0, evictions: 0, sets: 0,
          deletes: 0, clears: 0, size: 0
        }),
        resetStats: vi.fn().mockResolvedValue(undefined)
      };
      
      const faultyCollection = new CachedFlongoCollection<Product>('products', {
        enableCaching: true,
        cacheStore: faultyCache as any,
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false
      });
      
      mockCollection.findOne.mockResolvedValue(createMockProduct('1'));
      
      const result = await faultyCollection.get('1');
      expect(result._id).toBe('1');
    });
  });

  describe('Cache Bypass Patterns', () => {
    it('should bypass cache for sensitive queries', async () => {
      const bypassCollection = new CachedFlongoCollection<Product>('products', {
        enableCaching: true,
        cacheStore: cacheStore,
        cacheConfig: new CacheConfiguration(createDefaultConfig()),
        enableMonitoring: false,
        bypassCache: (operation, query) => {
          if (!query) return false;
          return query.expressions.some(e => 
            e.key === 'userId' || e.key === 'sessionId'
          );
        }
      });
      
      const normalProducts = [createMockProduct('1')];
      const userProducts = [createMockProduct('2')];
      
      mockCollection.find.mockImplementation(() => ({
        toArray: vi.fn().mockImplementation(() => {
          const filter = mockCollection.find.mock.calls[mockCollection.find.mock.calls.length - 1][0];
          if (filter?.userId) {
            return Promise.resolve(userProducts);
          }
          return Promise.resolve(normalProducts);
        })
      }));
      
      const normalQuery = new FlongoQuery().where('category').eq('electronics');
      const userQuery = new FlongoQuery().where('userId').eq('user123');
      
      await bypassCollection.getAll(normalQuery);
      await bypassCollection.getAll(normalQuery);
      
      await bypassCollection.getAll(userQuery);
      await bypassCollection.getAll(userQuery);
      
      expect(mockCollection.find).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance Metrics', () => {
    it('should track cache performance metrics', async () => {
      const products = Array.from({ length: 100 }, (_, i) => 
        createMockProduct(String(i + 1))
      );
      
      mockCollection.find().toArray.mockResolvedValue(products);
      mockCollection.countDocuments.mockResolvedValue(100);
      
      const queries = [
        new FlongoQuery().where('category').eq('electronics'),
        new FlongoQuery().where('price').gtEq(50),
        new FlongoQuery().where('inStock').eq(true)
      ];
      
      for (const query of queries) {
        await productCollection.getAll(query);
        await productCollection.getAll(query);
        await productCollection.count(query);
        await productCollection.count(query);
      }
      
      const stats = await cacheStore.getStats();
      
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.sets).toBeGreaterThan(0);
      
      const hitRate = stats.hits / (stats.hits + stats.misses);
      expect(hitRate).toBeGreaterThan(0.4);
    });
  });
});