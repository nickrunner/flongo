import { CacheStore } from "./cacheStore";
import { CacheStatsCollector } from "./cacheStats";
import { InvalidationStrategy } from "./invalidationStrategy";
import { FlongoQuery } from "../flongoQuery";
import { Entity } from "../types";

/**
 * Cache debugging information
 */
export interface CacheDebugInfo {
  totalEntries: number;
  memoryUsage?: number;
  hitRate: number;
  keys: string[];
  oldestEntry?: {
    key: string;
    age: number;
  };
  largestEntry?: {
    key: string;
    size: number;
  };
}

/**
 * Cache consistency check result
 */
export interface ConsistencyCheckResult {
  consistent: boolean;
  inconsistencies: string[];
}

/**
 * Manages cache operations, debugging, and maintenance
 */
export class CacheManager {
  constructor(
    private cacheStore: CacheStore<any>,
    private statsCollector: CacheStatsCollector,
    private invalidationStrategy: InvalidationStrategy
  ) {}

  /**
   * Clear entire collection cache
   */
  async clearCollection(): Promise<void> {
    await this.invalidationStrategy.invalidateCollection();
    this.statsCollector.recordClear();
  }

  /**
   * Clear cache for specific query
   */
  async clearQuery(query: FlongoQuery): Promise<void> {
    await this.invalidationStrategy.invalidateQuery(query);
  }

  /**
   * Preload cache with frequently accessed data
   */
  async preload<T>(
    queries: FlongoQuery[],
    fetchFn: (query: FlongoQuery) => Promise<T[]>
  ): Promise<void> {
    const preloadPromises = queries.map(async (query) => {
      const data = await fetchFn(query);
      // Cache will be populated through the normal read-through mechanism
      return data;
    });
    
    await Promise.all(preloadPromises);
  }

  /**
   * Warm up cache with specific documents
   */
  async warmup<T>(
    ids: string[],
    fetchFn: (id: string) => Promise<Entity & T>
  ): Promise<void> {
    const warmupPromises = ids.map(async (id) => {
      const data = await fetchFn(id);
      // Cache will be populated through the normal read-through mechanism
      return data;
    });
    
    await Promise.all(warmupPromises);
  }

  /**
   * Get detailed cache debugging information
   */
  async getDebugInfo(): Promise<CacheDebugInfo> {
    const keys = await this.cacheStore.keys();
    const stats = await this.cacheStore.getStats();
    const collectorStats = this.statsCollector.getStats();
    
    const hitRate = collectorStats.requests > 0
      ? (collectorStats.hits / collectorStats.requests) * 100
      : 0;
    
    return {
      totalEntries: keys.length,
      memoryUsage: stats.memoryUsage,
      hitRate,
      keys: keys.slice(0, 100), // Limit to first 100 keys for readability
      oldestEntry: await this.findOldestEntry(keys),
      largestEntry: await this.findLargestEntry(keys)
    };
  }

  /**
   * Verify cache consistency with database
   */
  async verifyConsistency<T>(
    sampleSize: number = 10,
    fetchFn: (id: string) => Promise<Entity & T>
  ): Promise<ConsistencyCheckResult> {
    const keys = await this.cacheStore.keys();
    const inconsistencies: string[] = [];
    
    // Filter for document keys (get:collection:id pattern)
    const documentKeys = keys.filter(key => key.includes(':get:'));
    
    // Sample random keys for checking
    const sampled = this.sampleArray(documentKeys, Math.min(sampleSize, documentKeys.length));
    
    for (const key of sampled) {
      // Extract ID from cache key
      const idMatch = key.match(/:get:.*id["\s]*:["\s]*["']([^"']+)["']/);
      if (!idMatch) continue;
      
      const id = idMatch[1];
      
      try {
        // Get cached version
        const cached = await this.cacheStore.get(key);
        if (!cached) continue;
        
        // Get fresh version from database
        const fresh = await fetchFn(id);
        
        // Compare
        if (!this.deepEqual(cached, fresh)) {
          inconsistencies.push(`Document ${id} is inconsistent`);
        }
      } catch (error) {
        inconsistencies.push(`Failed to verify document ${id}: ${error}`);
      }
    }
    
    return {
      consistent: inconsistencies.length === 0,
      inconsistencies
    };
  }

  /**
   * Export cache snapshot for debugging
   */
  async exportSnapshot(): Promise<Record<string, any>> {
    const keys = await this.cacheStore.keys();
    const snapshot: Record<string, any> = {};
    
    for (const key of keys) {
      const value = await this.cacheStore.get(key);
      snapshot[key] = value;
    }
    
    return snapshot;
  }

  /**
   * Import cache snapshot (useful for testing)
   */
  async importSnapshot(snapshot: Record<string, any>): Promise<void> {
    await this.cacheStore.clear();
    
    for (const [key, value] of Object.entries(snapshot)) {
      await this.cacheStore.set(key, value);
    }
  }

  /**
   * Monitor cache performance
   */
  async monitorPerformance(durationMs: number = 60000): Promise<{
    avgHitRate: number;
    avgResponseTime: number;
    peakMemoryUsage: number;
  }> {
    const startTime = Date.now();
    const samples: Array<{
      hitRate: number;
      responseTime: number;
      memoryUsage: number;
    }> = [];
    
    const interval = setInterval(async () => {
      const stats = this.statsCollector.getStats();
      const storeStats = await this.cacheStore.getStats();
      
      samples.push({
        hitRate: stats.requests > 0 ? stats.hits / stats.requests : 0,
        responseTime: stats.avgResponseTime,
        memoryUsage: storeStats.memoryUsage || 0
      });
    }, 1000);
    
    await new Promise(resolve => setTimeout(resolve, durationMs));
    clearInterval(interval);
    
    return {
      avgHitRate: samples.reduce((sum, s) => sum + s.hitRate, 0) / samples.length * 100,
      avgResponseTime: samples.reduce((sum, s) => sum + s.responseTime, 0) / samples.length,
      peakMemoryUsage: Math.max(...samples.map(s => s.memoryUsage))
    };
  }

  /**
   * Find the oldest cache entry
   */
  private async findOldestEntry(keys: string[]): Promise<{ key: string; age: number } | undefined> {
    // This would require storing creation timestamps in cache metadata
    // For now, return undefined as we don't track this in the base implementation
    return undefined;
  }

  /**
   * Find the largest cache entry
   */
  private async findLargestEntry(keys: string[]): Promise<{ key: string; size: number } | undefined> {
    let largest: { key: string; size: number } | undefined;
    
    for (const key of keys) {
      const value = await this.cacheStore.get(key);
      if (value) {
        const size = JSON.stringify(value).length;
        if (!largest || size > largest.size) {
          largest = { key, size };
        }
      }
    }
    
    return largest;
  }

  /**
   * Sample random items from array
   */
  private sampleArray<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  /**
   * Deep equality check for objects
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
}