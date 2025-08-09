import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  CacheInvalidator, 
  TTLStrategy, 
  LRUStrategy,
  InvalidationStrategy 
} from '../../cache/cacheStrategies';
import { MemoryCache } from '../../cache/memoryCache';

describe('CacheInvalidator', () => {
  let cache: MemoryCache;
  let invalidator: CacheInvalidator;
  
  beforeEach(() => {
    cache = new MemoryCache();
    invalidator = new CacheInvalidator(cache);
  });
  
  afterEach(() => {
    cache.destroy();
  });
  
  describe('pattern invalidation', () => {
    it('should invalidate by pattern', async () => {
      await cache.set('flongo:users:get:1', 'user1');
      await cache.set('flongo:users:get:2', 'user2');
      await cache.set('flongo:posts:get:1', 'post1');
      
      await invalidator.invalidatePattern('flongo:users:*');
      
      expect(await cache.get('flongo:users:get:1')).toBeUndefined();
      expect(await cache.get('flongo:users:get:2')).toBeUndefined();
      expect(await cache.get('flongo:posts:get:1')).toBe('post1');
    });
    
    it('should invalidate entire collection', async () => {
      await cache.set('flongo:users:get:1', 'user1');
      await cache.set('flongo:users:getAll:hash1', 'users');
      await cache.set('flongo:posts:get:1', 'post1');
      
      await invalidator.invalidateCollection('users');
      
      expect(await cache.get('flongo:users:get:1')).toBeUndefined();
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
      expect(await cache.get('flongo:posts:get:1')).toBe('post1');
    });
    
    it('should invalidate specific operation', async () => {
      await cache.set('flongo:users:get:1', 'user1');
      await cache.set('flongo:users:getAll:hash1', 'users');
      await cache.set('flongo:users:count:hash2', '10');
      
      await invalidator.invalidateOperation('users', 'getAll');
      
      expect(await cache.get('flongo:users:get:1')).toBe('user1');
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
      expect(await cache.get('flongo:users:count:hash2')).toBe('10');
    });
  });
  
  describe('smart invalidation', () => {
    beforeEach(async () => {
      await cache.set('flongo:users:get:1', 'user1');
      await cache.set('flongo:users:get:2', 'user2');
      await cache.set('flongo:users:getAll:hash1', 'all users');
      await cache.set('flongo:users:getSome:hash2', 'some users');
      await cache.set('flongo:users:count:hash3', '10');
      await cache.set('flongo:users:exists:hash4', 'true');
    });
    
    it('should invalidate list and count queries on create', async () => {
      await invalidator.smartInvalidate({
        collection: 'users',
        operation: 'create'
      });
      
      expect(await cache.get('flongo:users:get:1')).toBe('user1');
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
      expect(await cache.get('flongo:users:getSome:hash2')).toBeUndefined();
      expect(await cache.get('flongo:users:count:hash3')).toBeUndefined();
      expect(await cache.get('flongo:users:exists:hash4')).toBeUndefined();
    });
    
    it('should invalidate specific items and list queries on update', async () => {
      await invalidator.smartInvalidate({
        collection: 'users',
        operation: 'update',
        ids: ['1']
      });
      
      expect(await cache.get('flongo:users:get:1')).toBeUndefined();
      expect(await cache.get('flongo:users:get:2')).toBe('user2');
      // List queries should be invalidated for consistency
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
      expect(await cache.get('flongo:users:getSome:hash2')).toBeUndefined();
    });
    
    it('should invalidate everything on delete', async () => {
      await invalidator.smartInvalidate({
        collection: 'users',
        operation: 'delete',
        ids: ['1']
      });
      
      expect(await cache.get('flongo:users:get:1')).toBeUndefined();
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
      expect(await cache.get('flongo:users:count:hash3')).toBeUndefined();
    });
    
    it('should handle batch operations', async () => {
      await invalidator.smartInvalidate({
        collection: 'users',
        operation: 'batchUpdate',
        ids: ['1', '2']
      });
      
      expect(await cache.get('flongo:users:get:1')).toBeUndefined();
      expect(await cache.get('flongo:users:get:2')).toBeUndefined();
      expect(await cache.get('flongo:users:getAll:hash1')).toBeUndefined();
    });
  });
  
  describe('invalidation rules', () => {
    it('should add and apply rules', async () => {
      invalidator.addRule('flongo:users:*', {
        strategy: InvalidationStrategy.Manual,
        dependencies: ['flongo:posts:*']
      });
      
      await cache.set('flongo:users:get:1', 'user1');
      await cache.set('flongo:posts:get:1', 'post1');
      
      // The invalidate function will delete matching keys
      await invalidator.invalidate({
        collection: 'users',
        operation: 'update',
        ids: ['1']
      });
      
      // After invalidation, user1 should be gone but post1 should remain
      const keys = await cache.keys();
      expect(keys).toContain('flongo:posts:get:1');
      expect(keys).not.toContain('flongo:users:get:1');
    });
  });
});

describe('TTLStrategy', () => {
  let strategy: TTLStrategy;
  
  beforeEach(() => {
    strategy = new TTLStrategy(300);
  });
  
  it('should return default TTL', () => {
    const ttl = strategy.getTTL('any:key');
    expect(ttl).toBe(300);
  });
  
  it('should return custom TTL for matching pattern', () => {
    strategy.setTTL('flongo:users:*', 600);
    strategy.setTTL('flongo:posts:*', 120);
    
    expect(strategy.getTTL('flongo:users:get:1')).toBe(600);
    expect(strategy.getTTL('flongo:posts:get:1')).toBe(120);
    expect(strategy.getTTL('flongo:other:get:1')).toBe(300);
  });
  
  it('should handle exact matches', () => {
    strategy.setTTL('flongo:users:get:special', 1000);
    
    expect(strategy.getTTL('flongo:users:get:special')).toBe(1000);
    expect(strategy.getTTL('flongo:users:get:other')).toBe(300);
  });
});

describe('LRUStrategy', () => {
  let strategy: LRUStrategy;
  
  beforeEach(() => {
    strategy = new LRUStrategy(10000, 100);
  });
  
  it('should get and set max entries', () => {
    expect(strategy.getMaxEntries()).toBe(10000);
    
    strategy.setMaxEntries(5000);
    expect(strategy.getMaxEntries()).toBe(5000);
  });
  
  it('should get and set max memory', () => {
    expect(strategy.getMaxMemoryMB()).toBe(100);
    
    strategy.setMaxMemoryMB(200);
    expect(strategy.getMaxMemoryMB()).toBe(200);
  });
});