import { CacheStats } from './cacheStore';

export interface DetailedCacheStats extends CacheStats {
  hitRate: number;
  missRate: number;
  evictionRate: number;
  averageAccessTime?: number;
  totalRequests: number;
  uptime: number;
  lastReset: number;
}

export interface CacheMetrics {
  operationCounts: Map<string, number>;
  operationLatencies: Map<string, number[]>;
  collectionStats: Map<string, CacheStats>;
  keyAccessCounts: Map<string, number>;
  memoryUsageOverTime: Array<{ timestamp: number; usage: number }>;
}

export class CacheStatsCollector {
  private startTime: number;
  private lastResetTime: number;
  private metrics: CacheMetrics & {
    hits: number;
    misses: number;
    clears: number;
    responseTimeHistory: number[];
  };
  private maxHistorySize: number;
  
  constructor(maxHistorySize: number = 1000) {
    this.startTime = Date.now();
    this.lastResetTime = Date.now();
    this.maxHistorySize = maxHistorySize;
    this.metrics = {
      operationCounts: new Map(),
      operationLatencies: new Map(),
      collectionStats: new Map(),
      keyAccessCounts: new Map(),
      memoryUsageOverTime: [],
      hits: 0,
      misses: 0,
      clears: 0,
      responseTimeHistory: []
    };
  }
  
  recordOperation(operation: string, latencyMs: number): void {
    const count = this.metrics.operationCounts.get(operation) || 0;
    this.metrics.operationCounts.set(operation, count + 1);
    
    let latencies = this.metrics.operationLatencies.get(operation);
    if (!latencies) {
      latencies = [];
      this.metrics.operationLatencies.set(operation, latencies);
    }
    
    latencies.push(latencyMs);
    
    if (latencies.length > this.maxHistorySize) {
      latencies.shift();
    }
  }
  
  recordKeyAccess(key: string): void {
    const count = this.metrics.keyAccessCounts.get(key) || 0;
    this.metrics.keyAccessCounts.set(key, count + 1);
  }
  
  recordHit(): void {
    this.metrics.hits++;
    this.recordOperation('cache:hit', 0);
  }
  
  recordMiss(): void {
    this.metrics.misses++;
    this.recordOperation('cache:miss', 0);
  }
  
  recordResponseTime(timeMs: number): void {
    this.metrics.responseTimeHistory.push(timeMs);
    if (this.metrics.responseTimeHistory.length > this.maxHistorySize) {
      this.metrics.responseTimeHistory.shift();
    }
    this.recordOperation('cache:response', timeMs);
  }
  
  recordClear(): void {
    this.metrics.clears++;
  }
  
  recordMemoryUsage(usageBytes: number): void {
    const entry = {
      timestamp: Date.now(),
      usage: usageBytes
    };
    
    this.metrics.memoryUsageOverTime.push(entry);
    
    if (this.metrics.memoryUsageOverTime.length > this.maxHistorySize) {
      this.metrics.memoryUsageOverTime.shift();
    }
  }
  
  updateCollectionStats(collection: string, stats: Partial<CacheStats>): void {
    const existing = this.metrics.collectionStats.get(collection) || {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      size: 0
    };
    
    this.metrics.collectionStats.set(collection, {
      ...existing,
      ...stats
    });
  }
  
  getDetailedStats(baseStats: CacheStats): DetailedCacheStats {
    const totalRequests = baseStats.hits + baseStats.misses;
    const uptime = Math.max(1, Date.now() - this.startTime);
    
    return {
      ...baseStats,
      hitRate: totalRequests > 0 ? baseStats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? baseStats.misses / totalRequests : 0,
      evictionRate: baseStats.sets > 0 ? baseStats.evictions / baseStats.sets : 0,
      averageAccessTime: this.calculateAverageLatency('get'),
      totalRequests,
      uptime,
      lastReset: this.lastResetTime
    };
  }
  
  getOperationStats(): Map<string, {
    count: number;
    averageLatency: number;
    p50: number;
    p95: number;
    p99: number;
  }> {
    const stats = new Map();
    
    for (const [operation, count] of this.metrics.operationCounts.entries()) {
      const latencies = this.metrics.operationLatencies.get(operation) || [];
      
      if (latencies.length === 0) {
        stats.set(operation, {
          count,
          averageLatency: 0,
          p50: 0,
          p95: 0,
          p99: 0
        });
        continue;
      }
      
      const sorted = [...latencies].sort((a, b) => a - b);
      
      stats.set(operation, {
        count,
        averageLatency: this.calculateAverage(latencies),
        p50: this.calculatePercentile(sorted, 0.5),
        p95: this.calculatePercentile(sorted, 0.95),
        p99: this.calculatePercentile(sorted, 0.99)
      });
    }
    
    return stats;
  }
  
  getTopKeys(limit: number = 10): Array<{ key: string; count: number }> {
    const entries = Array.from(this.metrics.keyAccessCounts.entries());
    
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  }
  
  getMemoryTrend(): Array<{ timestamp: number; usage: number }> {
    return [...this.metrics.memoryUsageOverTime];
  }
  
  getCollectionStats(): Map<string, CacheStats> {
    return new Map(this.metrics.collectionStats);
  }
  
  getStats(): CacheMetrics & { requests: number; avgResponseTime: number } {
    const requests = this.metrics.hits + this.metrics.misses;
    const avgResponseTime = this.metrics.responseTimeHistory.length > 0
      ? this.calculateAverage(this.metrics.responseTimeHistory)
      : 0;
    
    return {
      ...this.metrics,
      requests,
      avgResponseTime
    };
  }
  
  reset(): void {
    this.lastResetTime = Date.now();
    this.metrics = {
      operationCounts: new Map(),
      operationLatencies: new Map(),
      collectionStats: new Map(),
      keyAccessCounts: new Map(),
      memoryUsageOverTime: [],
      hits: 0,
      misses: 0,
      clears: 0,
      responseTimeHistory: []
    };
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }
  
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
  
  private calculateAverageLatency(operation: string): number {
    const latencies = this.metrics.operationLatencies.get(operation);
    if (!latencies || latencies.length === 0) return 0;
    return this.calculateAverage(latencies);
  }
  
  toJSON(): object {
    const operationStats = Object.fromEntries(this.getOperationStats());
    const collectionStats = Object.fromEntries(this.getCollectionStats());
    
    return {
      uptime: Date.now() - this.startTime,
      lastReset: this.lastResetTime,
      operations: operationStats,
      collections: collectionStats,
      topKeys: this.getTopKeys(10),
      memoryTrend: this.getMemoryTrend().slice(-100)
    };
  }
}

export class CacheMonitor {
  private collectors: Map<string, CacheStatsCollector>;
  private globalCollector: CacheStatsCollector;
  private intervalId?: NodeJS.Timeout;
  
  constructor() {
    this.collectors = new Map();
    this.globalCollector = new CacheStatsCollector();
  }
  
  getCollector(name: string): CacheStatsCollector {
    let collector = this.collectors.get(name);
    
    if (!collector) {
      collector = new CacheStatsCollector();
      this.collectors.set(name, collector);
    }
    
    return collector;
  }
  
  getGlobalCollector(): CacheStatsCollector {
    return this.globalCollector;
  }
  
  startMonitoring(intervalMs: number = 60000, callback?: (stats: any) => void): void {
    if (this.intervalId) {
      return;
    }
    
    this.intervalId = setInterval(() => {
      const stats = this.getSnapshot();
      
      if (callback) {
        callback(stats);
      }
    }, intervalMs);
    
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }
  
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
  
  getSnapshot(): object {
    const snapshot: any = {
      timestamp: Date.now(),
      global: this.globalCollector.toJSON(),
      caches: {}
    };
    
    for (const [name, collector] of this.collectors.entries()) {
      snapshot.caches[name] = collector.toJSON();
    }
    
    return snapshot;
  }
  
  reset(): void {
    this.globalCollector.reset();
    
    for (const collector of this.collectors.values()) {
      collector.reset();
    }
  }
  
  destroy(): void {
    this.stopMonitoring();
    this.collectors.clear();
  }
}

let globalMonitor: CacheMonitor | undefined;

export function getGlobalCacheMonitor(): CacheMonitor {
  if (!globalMonitor) {
    globalMonitor = new CacheMonitor();
  }
  return globalMonitor;
}

export function resetGlobalCacheMonitor(): void {
  if (globalMonitor) {
    globalMonitor.destroy();
    globalMonitor = undefined;
  }
}