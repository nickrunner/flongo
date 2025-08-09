import { CacheStore } from "./cacheStore";
import { CacheKeyGenerator } from "./cacheKeyGenerator";
import { CacheStatsCollector } from "./cacheStats";

/**
 * Cache entry details for debugging
 */
export interface CacheEntryDetails {
  key: string;
  collection?: string;
  operation?: string;
  identifier?: string;
  value: any;
  size: number;
  type: string;
}

/**
 * Cache analysis report
 */
export interface CacheAnalysisReport {
  totalEntries: number;
  totalSize: number;
  collections: Map<string, number>;
  operations: Map<string, number>;
  largestEntries: CacheEntryDetails[];
  emptyEntries: string[];
  duplicatePatterns: string[];
}

/**
 * Cache debugging and inspection tools
 */
export class CacheDebugger {
  constructor(
    private cacheStore: CacheStore<any>,
    private statsCollector?: CacheStatsCollector
  ) {}

  /**
   * Inspect a specific cache entry
   */
  async inspectEntry(key: string): Promise<CacheEntryDetails | null> {
    const value = await this.cacheStore.get(key);
    if (value === undefined || value === null) {
      return null;
    }

    const parsed = CacheKeyGenerator.parseKey(key);
    const size = this.calculateSize(value);
    const type = this.determineType(value);

    return {
      key,
      collection: parsed.collection,
      operation: parsed.operation,
      identifier: parsed.identifier,
      value,
      size,
      type
    };
  }

  /**
   * Analyze cache contents and patterns
   */
  async analyze(): Promise<CacheAnalysisReport> {
    const keys = await this.cacheStore.keys();
    const collections = new Map<string, number>();
    const operations = new Map<string, number>();
    const entries: CacheEntryDetails[] = [];
    const emptyEntries: string[] = [];
    let totalSize = 0;

    // Analyze each cache entry
    for (const key of keys) {
      const value = await this.cacheStore.get(key);
      const parsed = CacheKeyGenerator.parseKey(key);
      
      // Track collections
      if (parsed.collection) {
        collections.set(parsed.collection, (collections.get(parsed.collection) || 0) + 1);
      }
      
      // Track operations
      if (parsed.operation) {
        operations.set(parsed.operation, (operations.get(parsed.operation) || 0) + 1);
      }
      
      // Check for empty entries
      if (value === null || value === undefined || 
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && Object.keys(value).length === 0)) {
        emptyEntries.push(key);
      }
      
      // Calculate size
      const size = this.calculateSize(value);
      totalSize += size;
      
      entries.push({
        key,
        collection: parsed.collection,
        operation: parsed.operation,
        identifier: parsed.identifier,
        value,
        size,
        type: this.determineType(value)
      });
    }

    // Find largest entries
    const largestEntries = entries
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    // Find duplicate patterns
    const duplicatePatterns = this.findDuplicatePatterns(keys);

    return {
      totalEntries: keys.length,
      totalSize,
      collections,
      operations,
      largestEntries,
      emptyEntries,
      duplicatePatterns
    };
  }

  /**
   * Monitor cache activity in real-time
   */
  async monitor(durationMs: number = 10000, intervalMs: number = 1000): Promise<{
    events: Array<{
      timestamp: number;
      type: string;
      details: any;
    }>;
    summary: {
      totalEvents: number;
      eventsPerSecond: number;
      mostActiveOperation: string;
    };
  }> {
    const events: Array<{
      timestamp: number;
      type: string;
      details: any;
    }> = [];
    
    const startTime = Date.now();
    const initialKeys = new Set(await this.cacheStore.keys());
    const operationCounts = new Map<string, number>();
    
    const checkInterval = setInterval(async () => {
      const currentKeys = new Set(await this.cacheStore.keys());
      
      // Find new keys
      for (const key of currentKeys) {
        if (!initialKeys.has(key)) {
          const parsed = CacheKeyGenerator.parseKey(key);
          events.push({
            timestamp: Date.now(),
            type: 'add',
            details: { key, operation: parsed.operation, collection: parsed.collection }
          });
          
          if (parsed.operation) {
            operationCounts.set(parsed.operation, (operationCounts.get(parsed.operation) || 0) + 1);
          }
        }
      }
      
      // Find removed keys
      for (const key of initialKeys) {
        if (!currentKeys.has(key)) {
          const parsed = CacheKeyGenerator.parseKey(key);
          events.push({
            timestamp: Date.now(),
            type: 'remove',
            details: { key, operation: parsed.operation, collection: parsed.collection }
          });
        }
      }
      
      // Update initial keys for next iteration
      initialKeys.clear();
      for (const key of currentKeys) {
        initialKeys.add(key);
      }
    }, intervalMs);
    
    // Wait for monitoring duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
    clearInterval(checkInterval);
    
    const elapsed = (Date.now() - startTime) / 1000;
    const mostActiveOperation = Array.from(operationCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
    
    return {
      events,
      summary: {
        totalEvents: events.length,
        eventsPerSecond: events.length / elapsed,
        mostActiveOperation
      }
    };
  }

  /**
   * Generate a visual representation of cache distribution
   */
  async visualize(): Promise<string> {
    const analysis = await this.analyze();
    let output = '\n=== Cache Distribution ===\n';
    
    // Collections breakdown
    output += '\nCollections:\n';
    for (const [collection, count] of analysis.collections) {
      const percentage = ((count / analysis.totalEntries) * 100).toFixed(1);
      const bar = this.createBar(count, analysis.totalEntries);
      output += `  ${collection.padEnd(20)} ${bar} ${count} (${percentage}%)\n`;
    }
    
    // Operations breakdown
    output += '\nOperations:\n';
    for (const [operation, count] of analysis.operations) {
      const percentage = ((count / analysis.totalEntries) * 100).toFixed(1);
      const bar = this.createBar(count, analysis.totalEntries);
      output += `  ${operation.padEnd(20)} ${bar} ${count} (${percentage}%)\n`;
    }
    
    // Size information
    output += '\nSize Information:\n';
    output += `  Total entries: ${analysis.totalEntries}\n`;
    output += `  Total size: ${this.formatBytes(analysis.totalSize)}\n`;
    output += `  Average size: ${this.formatBytes(analysis.totalSize / analysis.totalEntries)}\n`;
    
    // Largest entries
    if (analysis.largestEntries.length > 0) {
      output += '\nLargest Entries:\n';
      for (const entry of analysis.largestEntries.slice(0, 5)) {
        output += `  ${entry.key.substring(0, 50)}... (${this.formatBytes(entry.size)})\n`;
      }
    }
    
    // Warnings
    if (analysis.emptyEntries.length > 0) {
      output += `\n⚠️  Warning: ${analysis.emptyEntries.length} empty cache entries found\n`;
    }
    
    if (analysis.duplicatePatterns.length > 0) {
      output += `\n⚠️  Warning: ${analysis.duplicatePatterns.length} potential duplicate patterns found\n`;
    }
    
    return output;
  }

  /**
   * Export cache snapshot for analysis
   */
  async exportSnapshot(includeValues: boolean = false): Promise<{
    timestamp: number;
    stats: any;
    entries: Array<{
      key: string;
      size: number;
      type: string;
      value?: any;
    }>;
  }> {
    const keys = await this.cacheStore.keys();
    const entries = [];
    
    for (const key of keys) {
      const value = await this.cacheStore.get(key);
      const entry: any = {
        key,
        size: this.calculateSize(value),
        type: this.determineType(value)
      };
      
      if (includeValues) {
        entry.value = value;
      }
      
      entries.push(entry);
    }
    
    return {
      timestamp: Date.now(),
      stats: this.statsCollector ? this.statsCollector.getStats() : null,
      entries
    };
  }

  /**
   * Find potential memory leaks
   */
  async findMemoryLeaks(): Promise<{
    suspiciousKeys: string[];
    recommendations: string[];
  }> {
    const keys = await this.cacheStore.keys();
    const suspiciousKeys: string[] = [];
    const recommendations: string[] = [];
    
    for (const key of keys) {
      const value = await this.cacheStore.get(key);
      const size = this.calculateSize(value);
      
      // Check for oversized entries
      if (size > 1024 * 1024) { // > 1MB
        suspiciousKeys.push(key);
        recommendations.push(`Large cache entry: ${key} (${this.formatBytes(size)})`);
      }
      
      // Check for null/undefined values that shouldn't be cached
      if (value === null || value === undefined) {
        suspiciousKeys.push(key);
        recommendations.push(`Null/undefined cached: ${key}`);
      }
    }
    
    // Check for too many entries
    if (keys.length > 10000) {
      recommendations.push(`High number of cache entries: ${keys.length}. Consider implementing cache eviction.`);
    }
    
    return {
      suspiciousKeys,
      recommendations
    };
  }

  /**
   * Calculate size of a value in bytes
   */
  private calculateSize(value: any): number {
    if (value === null || value === undefined) return 0;
    
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  /**
   * Determine the type of a cached value
   */
  private determineType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (typeof value === 'object') {
      const keys = Object.keys(value).length;
      if (value._id) return `document`;
      return `object[${keys}]`;
    }
    return typeof value;
  }

  /**
   * Find duplicate patterns in cache keys
   */
  private findDuplicatePatterns(keys: string[]): string[] {
    const patterns = new Map<string, number>();
    
    for (const key of keys) {
      // Extract pattern by removing specific IDs
      const pattern = key.replace(/[a-f0-9]{24}/g, '<ID>')
                        .replace(/\d+/g, '<NUM>');
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }
    
    // Find patterns that appear multiple times
    const duplicates: string[] = [];
    for (const [pattern, count] of patterns) {
      if (count > 10) {
        duplicates.push(`${pattern} (${count} instances)`);
      }
    }
    
    return duplicates;
  }

  /**
   * Create a simple bar chart
   */
  private createBar(value: number, max: number, width: number = 20): string {
    const percentage = value / max;
    const filled = Math.round(percentage * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}