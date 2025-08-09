import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  CacheStatsCollector,
  CacheMonitor,
  getGlobalCacheMonitor,
  resetGlobalCacheMonitor
} from '../../cache/cacheStats';

describe('CacheStatsCollector', () => {
  let collector: CacheStatsCollector;
  
  beforeEach(() => {
    collector = new CacheStatsCollector();
  });
  
  describe('operation recording', () => {
    it('should record operations', () => {
      collector.recordOperation('get', 5);
      collector.recordOperation('get', 10);
      collector.recordOperation('set', 3);
      
      const stats = collector.getOperationStats();
      
      expect(stats.get('get')).toMatchObject({
        count: 2,
        averageLatency: 7.5
      });
      
      expect(stats.get('set')).toMatchObject({
        count: 1,
        averageLatency: 3
      });
    });
    
    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordOperation('get', i);
      }
      
      const stats = collector.getOperationStats();
      const getStats = stats.get('get');
      
      expect(getStats?.p50).toBe(50);
      expect(getStats?.p95).toBe(95);
      expect(getStats?.p99).toBe(99);
    });
    
    it('should limit history size', () => {
      const smallCollector = new CacheStatsCollector(10);
      
      for (let i = 0; i < 20; i++) {
        smallCollector.recordOperation('get', i);
      }
      
      const stats = smallCollector.getOperationStats();
      const getStats = stats.get('get');
      
      expect(getStats?.count).toBe(20);
    });
  });
  
  describe('key access tracking', () => {
    it('should track key access counts', () => {
      collector.recordKeyAccess('key1');
      collector.recordKeyAccess('key1');
      collector.recordKeyAccess('key2');
      collector.recordKeyAccess('key1');
      
      const topKeys = collector.getTopKeys(2);
      
      expect(topKeys).toHaveLength(2);
      expect(topKeys[0]).toEqual({ key: 'key1', count: 3 });
      expect(topKeys[1]).toEqual({ key: 'key2', count: 1 });
    });
    
    it('should limit top keys result', () => {
      for (let i = 0; i < 20; i++) {
        collector.recordKeyAccess(`key${i}`);
      }
      
      const topKeys = collector.getTopKeys(5);
      expect(topKeys).toHaveLength(5);
    });
  });
  
  describe('memory tracking', () => {
    it('should track memory usage over time', () => {
      collector.recordMemoryUsage(1000);
      collector.recordMemoryUsage(2000);
      collector.recordMemoryUsage(1500);
      
      const trend = collector.getMemoryTrend();
      
      expect(trend).toHaveLength(3);
      expect(trend[0].usage).toBe(1000);
      expect(trend[1].usage).toBe(2000);
      expect(trend[2].usage).toBe(1500);
    });
    
    it('should limit memory history', () => {
      const smallCollector = new CacheStatsCollector(5);
      
      for (let i = 0; i < 10; i++) {
        smallCollector.recordMemoryUsage(i * 1000);
      }
      
      const trend = smallCollector.getMemoryTrend();
      expect(trend).toHaveLength(5);
    });
  });
  
  describe('collection stats', () => {
    it('should update collection stats', () => {
      collector.updateCollectionStats('users', {
        hits: 10,
        misses: 5
      });
      
      collector.updateCollectionStats('users', {
        hits: 15,
        sets: 3
      });
      
      const stats = collector.getCollectionStats();
      const userStats = stats.get('users');
      
      expect(userStats).toMatchObject({
        hits: 15,
        misses: 5,
        sets: 3
      });
    });
  });
  
  describe('detailed stats', () => {
    it('should calculate detailed stats', () => {
      const baseStats = {
        hits: 80,
        misses: 20,
        evictions: 5,
        sets: 50,
        deletes: 10,
        clears: 1,
        size: 100
      };
      
      const detailed = collector.getDetailedStats(baseStats);
      
      expect(detailed.hitRate).toBeCloseTo(0.8);
      expect(detailed.missRate).toBeCloseTo(0.2);
      expect(detailed.evictionRate).toBeCloseTo(0.1);
      expect(detailed.totalRequests).toBe(100);
      expect(detailed.uptime).toBeGreaterThan(0);
    });
    
    it('should handle zero requests', () => {
      const baseStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        sets: 0,
        deletes: 0,
        clears: 0,
        size: 0
      };
      
      const detailed = collector.getDetailedStats(baseStats);
      
      expect(detailed.hitRate).toBe(0);
      expect(detailed.missRate).toBe(0);
      expect(detailed.evictionRate).toBe(0);
    });
  });
  
  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordOperation('get', 10);
      collector.recordKeyAccess('key1');
      collector.recordMemoryUsage(1000);
      collector.updateCollectionStats('users', { hits: 5 });
      
      collector.reset();
      
      const ops = collector.getOperationStats();
      const topKeys = collector.getTopKeys();
      const memory = collector.getMemoryTrend();
      const collections = collector.getCollectionStats();
      
      expect(ops.size).toBe(0);
      expect(topKeys).toHaveLength(0);
      expect(memory).toHaveLength(0);
      expect(collections.size).toBe(0);
    });
  });
  
  describe('toJSON', () => {
    it('should export stats as JSON', () => {
      collector.recordOperation('get', 10);
      collector.recordKeyAccess('key1');
      collector.recordMemoryUsage(1000);
      
      const json = collector.toJSON();
      
      expect(json).toHaveProperty('uptime');
      expect(json).toHaveProperty('lastReset');
      expect(json).toHaveProperty('operations');
      expect(json).toHaveProperty('collections');
      expect(json).toHaveProperty('topKeys');
      expect(json).toHaveProperty('memoryTrend');
    });
  });
});

describe('CacheMonitor', () => {
  let monitor: CacheMonitor;
  
  beforeEach(() => {
    monitor = new CacheMonitor();
  });
  
  afterEach(() => {
    monitor.destroy();
  });
  
  describe('collector management', () => {
    it('should create and retrieve collectors', () => {
      const collector1 = monitor.getCollector('cache1');
      const collector2 = monitor.getCollector('cache1');
      const collector3 = monitor.getCollector('cache2');
      
      expect(collector1).toBe(collector2);
      expect(collector1).not.toBe(collector3);
    });
    
    it('should have global collector', () => {
      const global1 = monitor.getGlobalCollector();
      const global2 = monitor.getGlobalCollector();
      
      expect(global1).toBe(global2);
    });
  });
  
  describe('monitoring', () => {
    it('should start and stop monitoring', () => {
      const callback = vi.fn();
      
      monitor.startMonitoring(50, callback);
      
      return new Promise<void>(resolve => {
        setTimeout(() => {
          monitor.stopMonitoring();
          expect(callback).toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
    
    it('should not start multiple monitors', () => {
      monitor.startMonitoring(1000);
      monitor.startMonitoring(1000);
      
      monitor.stopMonitoring();
    });
  });
  
  describe('snapshot', () => {
    it('should get snapshot of all stats', () => {
      const collector1 = monitor.getCollector('cache1');
      const collector2 = monitor.getCollector('cache2');
      const global = monitor.getGlobalCollector();
      
      collector1.recordOperation('get', 10);
      collector2.recordOperation('set', 5);
      global.recordOperation('total', 15);
      
      const snapshot = monitor.getSnapshot();
      
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('global');
      expect(snapshot).toHaveProperty('caches');
    });
  });
  
  describe('reset', () => {
    it('should reset all collectors', () => {
      const collector = monitor.getCollector('cache1');
      const global = monitor.getGlobalCollector();
      
      collector.recordOperation('get', 10);
      global.recordOperation('total', 10);
      
      monitor.reset();
      
      const collectorStats = collector.getOperationStats();
      const globalStats = global.getOperationStats();
      
      expect(collectorStats.size).toBe(0);
      expect(globalStats.size).toBe(0);
    });
  });
});

describe('Global monitor', () => {
  afterEach(() => {
    resetGlobalCacheMonitor();
  });
  
  it('should get singleton global monitor', () => {
    const monitor1 = getGlobalCacheMonitor();
    const monitor2 = getGlobalCacheMonitor();
    
    expect(monitor1).toBe(monitor2);
  });
  
  it('should reset global monitor', () => {
    const monitor1 = getGlobalCacheMonitor();
    resetGlobalCacheMonitor();
    const monitor2 = getGlobalCacheMonitor();
    
    expect(monitor1).not.toBe(monitor2);
  });
});