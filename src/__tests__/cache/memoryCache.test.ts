import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache } from '../../cache/memoryCache';

describe('MemoryCache', () => {
  let cache: MemoryCache<any>;
  
  beforeEach(() => {
    cache = new MemoryCache({
      maxEntries: 5,
      defaultTTL: 10,
      checkInterval: 0,
      enableStats: true
    });
  });
  
  afterEach(() => {
    cache.destroy();
  });
  
  describe('basic operations', () => {
    it('should set and get values', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });
    
    it('should return undefined for non-existent keys', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeUndefined();
    });
    
    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      const deleted = await cache.delete('key1');
      expect(deleted).toBe(true);
      
      const value = await cache.get('key1');
      expect(value).toBeUndefined();
    });
    
    it('should return false when deleting non-existent key', async () => {
      const deleted = await cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });
    
    it('should clear all values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();
      
      const size = await cache.size();
      expect(size).toBe(0);
    });
    
    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      
      const exists1 = await cache.has('key1');
      expect(exists1).toBe(true);
      
      const exists2 = await cache.has('nonexistent');
      expect(exists2).toBe(false);
    });
    
    it('should return size', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      const size = await cache.size();
      expect(size).toBe(2);
    });
    
    it('should return all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');
      
      const keys = await cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });
  
  describe('TTL functionality', () => {
    it('should expire entries after TTL', async () => {
      const shortCache = new MemoryCache({
        defaultTTL: 0.1,
        checkInterval: 0
      });
      
      await shortCache.set('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const value = await shortCache.get('key1');
      expect(value).toBeUndefined();
      
      shortCache.destroy();
    });
    
    it('should use custom TTL over default', async () => {
      await cache.set('key1', 'value1', 0.1);
      
      const value1 = await cache.get('key1');
      expect(value1).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const value2 = await cache.get('key1');
      expect(value2).toBeUndefined();
    });
    
    it('should not expire entries with no TTL', async () => {
      const noTTLCache = new MemoryCache({
        defaultTTL: 0,
        checkInterval: 0
      });
      
      await noTTLCache.set('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const value = await noTTLCache.get('key1');
      expect(value).toBe('value1');
      
      noTTLCache.destroy();
    });
  });
  
  describe('LRU eviction', () => {
    it('should evict least recently used items when at capacity', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');
      await cache.set('key4', 'value4');
      await cache.set('key5', 'value5');
      
      await cache.set('key6', 'value6');
      
      const value1 = await cache.get('key1');
      expect(value1).toBeUndefined();
      
      const value6 = await cache.get('key6');
      expect(value6).toBe('value6');
    });
    
    it('should update LRU order on access', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');
      await cache.set('key4', 'value4');
      await cache.set('key5', 'value5');
      
      await cache.get('key1');
      
      await cache.set('key6', 'value6');
      
      const value1 = await cache.get('key1');
      expect(value1).toBe('value1');
      
      const value2 = await cache.get('key2');
      expect(value2).toBeUndefined();
    });
  });
  
  describe('statistics', () => {
    it('should track hits and misses', async () => {
      await cache.set('key1', 'value1');
      
      await cache.get('key1');
      await cache.get('nonexistent');
      
      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
    
    it('should track sets and deletes', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.delete('key1');
      
      const stats = await cache.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(1);
    });
    
    it('should track clears', async () => {
      await cache.set('key1', 'value1');
      await cache.clear();
      
      const stats = await cache.getStats();
      expect(stats.clears).toBe(1);
    });
    
    it('should track evictions', async () => {
      for (let i = 1; i <= 6; i++) {
        await cache.set(`key${i}`, `value${i}`);
      }
      
      const stats = await cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
    
    it('should reset stats', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      
      await cache.resetStats();
      
      const stats = await cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
    });
  });
  
  describe('concurrent access', () => {
    it('should handle concurrent sets', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`key${i}`, `value${i}`));
      }
      
      await Promise.all(promises);
      
      const size = await cache.size();
      expect(size).toBe(5);
    });
    
    it('should handle concurrent gets', async () => {
      await cache.set('key1', 'value1');
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(cache.get('key1'));
      }
      
      const results = await Promise.all(promises);
      
      for (const result of results) {
        expect(result).toBe('value1');
      }
    });
    
    it('should handle mixed concurrent operations', async () => {
      const operations = [];
      
      for (let i = 0; i < 5; i++) {
        operations.push(cache.set(`key${i}`, `value${i}`));
        operations.push(cache.get(`key${i}`));
        operations.push(cache.has(`key${i}`));
      }
      
      await Promise.all(operations);
      
      const size = await cache.size();
      expect(size).toBeLessThanOrEqual(5);
    });
  });
  
  describe('memory management', () => {
    it('should estimate memory usage', async () => {
      await cache.set('key1', 'a'.repeat(1000));
      
      const usage = await cache.getMemoryUsage();
      expect(usage).toBeGreaterThan(1000);
    });
    
    it('should handle different value types', async () => {
      await cache.set('string', 'value');
      await cache.set('number', 42);
      await cache.set('boolean', true);
      await cache.set('object', { foo: 'bar' });
      await cache.set('array', [1, 2, 3]);
      
      expect(await cache.get('string')).toBe('value');
      expect(await cache.get('number')).toBe(42);
      expect(await cache.get('boolean')).toBe(true);
      expect(await cache.get('object')).toEqual({ foo: 'bar' });
      expect(await cache.get('array')).toEqual([1, 2, 3]);
    });
    
    it('should handle null and undefined values', async () => {
      await cache.set('null', null);
      await cache.set('undefined', undefined);
      
      expect(await cache.get('null')).toBe(null);
      expect(await cache.get('undefined')).toBe(undefined);
    });
  });
  
  describe('cleanup interval', () => {
    it('should cleanup expired entries periodically', async () => {
      const intervalCache = new MemoryCache({
        defaultTTL: 0.1,
        checkInterval: 0.05,
        enableStats: true
      });
      
      await intervalCache.set('key1', 'value1');
      await intervalCache.set('key2', 'value2');
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const size = await intervalCache.size();
      expect(size).toBe(0);
      
      intervalCache.destroy();
    });
  });
  
  describe('onEviction callback', () => {
    it('should call onEviction when items are evicted', async () => {
      const evicted: Array<{ key: string; value: any }> = [];
      
      const cacheWithCallback = new MemoryCache({
        maxEntries: 2,
        onEviction: (key, value) => {
          evicted.push({ key, value });
        }
      });
      
      await cacheWithCallback.set('key1', 'value1');
      await cacheWithCallback.set('key2', 'value2');
      await cacheWithCallback.set('key3', 'value3');
      
      expect(evicted).toHaveLength(1);
      expect(evicted[0]).toEqual({ key: 'key1', value: 'value1' });
      
      cacheWithCallback.destroy();
    });
  });
});