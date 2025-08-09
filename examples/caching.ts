/**
 * Comprehensive examples demonstrating the Flongo caching layer
 * This file shows all major caching features including:
 * - Read-through caching
 * - Write-through caching
 * - Cache invalidation
 * - Manual cache management
 * - Cache debugging and monitoring
 */

import { CachedFlongoCollection } from '../src/cachedFlongoCollection';
import { FlongoQuery } from '../src/flongoQuery';
import { CacheConfiguration, CacheMode } from '../src/cache/cacheConfig';
import { MemoryCache } from '../src/cache/memoryCache';
import { InvalidationStrategy } from '../src/cache/invalidationStrategy';

// ===========================================
// 1. BASIC CACHED COLLECTION SETUP
// ===========================================

interface User {
  name: string;
  email: string;
  age: number;
  tags: string[];
  score: number;
  active: boolean;
}

// Create a cached collection with default settings
const users = new CachedFlongoCollection<User>('users', {
  enableCaching: true,
  cacheMode: CacheMode.READ_WRITE, // Enable both read and write caching
  cacheConfig: CacheConfiguration.development() // Use development presets
});

// Create a production-optimized cached collection
const productionUsers = new CachedFlongoCollection<User>('users', {
  enableCaching: true,
  cacheMode: CacheMode.READ_WRITE,
  cacheConfig: {
    maxEntries: 50000,     // Higher limit for production
    ttlSeconds: 3600,      // 1 hour TTL
    maxMemoryMB: 512,      // 512MB memory limit
    enableStats: true,     // Enable performance monitoring
    compressionEnabled: false
  }
});

// ===========================================
// 2. READ-THROUGH CACHING EXAMPLES
// ===========================================

async function readThroughCachingExamples() {
  console.log('--- Read-Through Caching Examples ---');
  
  // First call fetches from database and caches result
  const user1 = await users.get('user123');
  console.log('First fetch (from DB):', user1);
  
  // Second call returns from cache (much faster)
  const user2 = await users.get('user123');
  console.log('Second fetch (from cache):', user2);
  
  // Query caching - complex queries are also cached
  const query = new FlongoQuery()
    .where('age').gtEq(18)
    .and('active').eq(true)
    .and('tags').arrContainsAny(['developer', 'designer'])
    .orderBy('score', 'desc')
    .limit(10);
  
  // First query execution
  const results1 = await users.getAll(query);
  console.log('Query results (from DB):', results1.length, 'users');
  
  // Subsequent identical query uses cache
  const results2 = await users.getAll(query);
  console.log('Query results (from cache):', results2.length, 'users');
  
  // Count operations are cached too
  const count = await users.count(query);
  console.log('User count:', count);
  
  // Check if documents exist (cached)
  const exists = await users.exists(query);
  console.log('Matching users exist:', exists);
}

// ===========================================
// 3. WRITE-THROUGH CACHING EXAMPLES
// ===========================================

async function writeThroughCachingExamples() {
  console.log('\n--- Write-Through Caching Examples ---');
  
  // Create operation - caches the new document
  const newUser = await users.create({
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    tags: ['developer'],
    score: 100,
    active: true
  });
  console.log('Created user:', newUser._id);
  
  // The newly created document is immediately available in cache
  const cachedNew = await users.get(newUser._id);
  console.log('Retrieved from cache immediately:', cachedNew.name);
  
  // Update operation - updates cache and invalidates affected queries
  await users.update(newUser._id, {
    score: 150,
    tags: ['developer', 'senior']
  });
  
  // Updated document is in cache with new values
  const updated = await users.get(newUser._id);
  console.log('Updated score:', updated.score);
  
  // Batch operations
  await users.batchCreate([
    { name: 'User 1', email: 'user1@example.com', age: 25, tags: [], score: 50, active: true },
    { name: 'User 2', email: 'user2@example.com', age: 35, tags: [], score: 75, active: true },
    { name: 'User 3', email: 'user3@example.com', age: 45, tags: [], score: 100, active: false }
  ]);
  console.log('Batch created 3 users');
  
  // Delete operation - removes from cache and invalidates queries
  await users.delete(newUser._id, 'client123');
  console.log('Deleted user:', newUser._id);
}

// ===========================================
// 4. ATOMIC OPERATIONS WITH CACHE UPDATES
// ===========================================

async function atomicOperationsExamples() {
  console.log('\n--- Atomic Operations Examples ---');
  
  const userId = 'user456';
  
  // Increment operation - updates cached value without full reload
  await users.increment(userId, 'score', 10);
  console.log('Incremented score by 10');
  
  // Decrement operation
  await users.decrement(userId, 'score', 5);
  console.log('Decremented score by 5');
  
  // Array append - adds items to array field in cache
  await users.append(userId, 'tags', ['expert', 'mentor']);
  console.log('Added tags to user');
  
  // Array remove - removes items from array field in cache
  await users.arrRemove(userId, 'tags', ['mentor']);
  console.log('Removed tag from user');
  
  // All these operations update the cache intelligently
  // without requiring a full document reload
}

// ===========================================
// 5. INTELLIGENT CACHE INVALIDATION
// ===========================================

async function cacheInvalidationExamples() {
  console.log('\n--- Cache Invalidation Examples ---');
  
  // Setup: Cache some queries
  const activeUsersQuery = new FlongoQuery().where('active').eq(true);
  const seniorDevsQuery = new FlongoQuery()
    .where('tags').arrContains('senior')
    .and('tags').arrContains('developer');
  
  await users.getAll(activeUsersQuery); // Cache active users
  await users.getAll(seniorDevsQuery);  // Cache senior developers
  
  // Update that affects cached queries
  await users.updateAll(
    { active: false },
    new FlongoQuery().where('age').gt(65)
  );
  console.log('Retired users over 65 - relevant caches invalidated');
  
  // The active users query cache is now invalidated
  // Next call will fetch fresh data
  const activeUsers = await users.getAll(activeUsersQuery);
  console.log('Active users (fresh from DB):', activeUsers.length);
  
  // Bulk delete invalidates multiple caches
  const idsToDelete = ['user1', 'user2', 'user3'];
  await users.batchDelete(idsToDelete, 'admin');
  console.log('Batch deleted - count and list caches invalidated');
}

// ===========================================
// 6. MANUAL CACHE MANAGEMENT
// ===========================================

async function manualCacheManagementExamples() {
  console.log('\n--- Manual Cache Management Examples ---');
  
  // Clear all caches for the collection
  await users.clearCache();
  console.log('Cleared all caches for users collection');
  
  // Clear specific query cache
  const query = new FlongoQuery().where('age').gt(30);
  await users.clearQuery(query);
  console.log('Cleared cache for specific query');
  
  // Refresh a specific document in cache
  const refreshedUser = await users.refreshDocument('user123');
  console.log('Refreshed user in cache:', refreshedUser._id);
  
  // Preload frequently accessed data
  const importantQueries = [
    new FlongoQuery().where('active').eq(true).limit(100),
    new FlongoQuery().where('score').gt(90).orderBy('score', 'desc'),
    new FlongoQuery().where('tags').arrContains('vip')
  ];
  
  await users.preloadCache(importantQueries);
  console.log('Preloaded', importantQueries.length, 'queries into cache');
}

// ===========================================
// 7. CACHE STATISTICS AND MONITORING
// ===========================================

async function cacheStatisticsExamples() {
  console.log('\n--- Cache Statistics Examples ---');
  
  // Get cache statistics
  const stats = await users.getCacheStats();
  console.log('Cache Stats:');
  console.log('  Store size:', stats.store.size);
  console.log('  Memory usage:', stats.store.memoryUsage, 'bytes');
  console.log('  Hit rate:', (stats.collector.hitRate * 100).toFixed(2), '%');
  console.log('  Total requests:', stats.collector.requests);
  console.log('  Cache hits:', stats.collector.hits);
  console.log('  Cache misses:', stats.collector.misses);
  
  // Verify cache consistency
  const consistency = await users.verifyCacheConsistency(10);
  if (consistency.consistent) {
    console.log('Cache is consistent with database');
  } else {
    console.log('Inconsistencies found:', consistency.inconsistencies);
  }
}

// ===========================================
// 8. CACHE DEBUGGING TOOLS
// ===========================================

async function cacheDebuggingExamples() {
  console.log('\n--- Cache Debugging Examples ---');
  
  // Visual representation of cache distribution
  const visualization = await users.debugCache();
  console.log(visualization);
  
  // Analyze cache health
  const health = await users.analyzeCacheHealth();
  console.log('Cache Analysis:');
  console.log('  Total entries:', health.analysis.totalEntries);
  console.log('  Total size:', health.analysis.totalSize, 'bytes');
  console.log('  Collections:', Array.from(health.analysis.collections.entries()));
  console.log('  Operations:', Array.from(health.analysis.operations.entries()));
  
  if (health.analysis.largestEntries.length > 0) {
    console.log('  Largest entry:', health.analysis.largestEntries[0].key,
                '(', health.analysis.largestEntries[0].size, 'bytes)');
  }
  
  if (health.memoryLeaks.suspiciousKeys.length > 0) {
    console.log('  Potential memory leaks detected!');
    console.log('  Recommendations:', health.memoryLeaks.recommendations);
  }
  
  // Monitor cache activity
  console.log('\nMonitoring cache for 5 seconds...');
  const monitoring = await users.monitorCache(5000);
  console.log('Monitoring results:');
  console.log('  Total events:', monitoring.summary.totalEvents);
  console.log('  Events/second:', monitoring.summary.eventsPerSecond.toFixed(2));
  console.log('  Most active operation:', monitoring.summary.mostActiveOperation);
  
  // Export cache snapshot for analysis
  const snapshot = await users.exportCacheSnapshot(false); // Don't include values
  console.log('Cache snapshot exported:');
  console.log('  Timestamp:', new Date(snapshot.timestamp));
  console.log('  Entries:', snapshot.entries.length);
}

// ===========================================
// 9. CUSTOM CACHE STORE IMPLEMENTATION
// ===========================================

import { CacheStore } from '../src/cache/cacheStore';

class CustomRedisCache implements CacheStore<any> {
  // Custom implementation using Redis
  async get(key: string): Promise<any> {
    // Redis GET implementation
    return null;
  }
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    // Redis SET with optional TTL
  }
  
  async delete(key: string): Promise<boolean> {
    // Redis DEL
    return true;
  }
  
  async clear(): Promise<void> {
    // Redis FLUSHDB for this namespace
  }
  
  async has(key: string): Promise<boolean> {
    // Redis EXISTS
    return false;
  }
  
  async size(): Promise<number> {
    // Redis DBSIZE
    return 0;
  }
  
  async keys(): Promise<string[]> {
    // Redis KEYS pattern
    return [];
  }
  
  async getStats(): Promise<any> {
    // Custom stats from Redis INFO
    return {};
  }
  
  async resetStats(): Promise<void> {
    // Reset custom stats
  }
}

// Use custom cache store
const customCachedUsers = new CachedFlongoCollection<User>('users', {
  enableCaching: true,
  cacheStore: new CustomRedisCache()
});

// ===========================================
// 10. CACHE INVALIDATION HOOKS
// ===========================================

async function cacheInvalidationHooksExample() {
  console.log('\n--- Cache Invalidation Hooks Example ---');
  
  // Register custom invalidation hook
  const invalidationStrategy = new InvalidationStrategy(
    new MemoryCache(),
    'users'
  );
  
  await invalidationStrategy.registerInvalidationHook(
    async (operation: string, data: any) => {
      console.log(`Cache invalidation hook triggered:`);
      console.log(`  Operation: ${operation}`);
      console.log(`  Data:`, data);
      
      // Custom logic here
      if (operation === 'delete') {
        console.log('  -> Triggering cleanup tasks for deleted document');
      }
      
      if (operation === 'bulkUpdate') {
        console.log('  -> Notifying external services about bulk update');
      }
    }
  );
  
  // Trigger invalidation
  await invalidationStrategy.invalidateOnDelete('user123');
}

// ===========================================
// 11. PERFORMANCE OPTIMIZATION PATTERNS
// ===========================================

async function performanceOptimizationExamples() {
  console.log('\n--- Performance Optimization Patterns ---');
  
  // Pattern 1: Warm up cache on application start
  async function warmUpCache() {
    const criticalQueries = [
      new FlongoQuery().where('featured').eq(true),
      new FlongoQuery().where('role').eq('admin')
    ];
    
    await users.preloadCache(criticalQueries);
    console.log('Cache warmed up with critical data');
  }
  
  // Pattern 2: Use read-only cache for read-heavy operations
  const readOnlyUsers = new CachedFlongoCollection<User>('users', {
    enableCaching: true,
    cacheMode: CacheMode.READ_ONLY, // No write-through overhead
    cacheConfig: {
      maxEntries: 100000,
      ttlSeconds: 7200 // 2 hours for read-only data
    }
  });
  
  // Pattern 3: Disable caching for write-heavy operations
  const writeHeavyUsers = new CachedFlongoCollection<User>('users', {
    enableCaching: false // No caching overhead for writes
  });
  
  // Pattern 4: Use appropriate TTL for different data types
  const sessionData = new CachedFlongoCollection<any>('sessions', {
    cacheConfig: {
      ttlSeconds: 900 // 15 minutes for session data
    }
  });
  
  const staticData = new CachedFlongoCollection<any>('config', {
    cacheConfig: {
      ttlSeconds: 86400 // 24 hours for static configuration
    }
  });
}

// ===========================================
// MAIN EXECUTION
// ===========================================

async function main() {
  console.log('===========================================');
  console.log('    Flongo Caching Layer Examples');
  console.log('===========================================\n');
  
  try {
    await readThroughCachingExamples();
    await writeThroughCachingExamples();
    await atomicOperationsExamples();
    await cacheInvalidationExamples();
    await manualCacheManagementExamples();
    await cacheStatisticsExamples();
    await cacheDebuggingExamples();
    await cacheInvalidationHooksExample();
    await performanceOptimizationExamples();
    
    console.log('\n===========================================');
    console.log('    All examples completed successfully!');
    console.log('===========================================');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  readThroughCachingExamples,
  writeThroughCachingExamples,
  atomicOperationsExamples,
  cacheInvalidationExamples,
  manualCacheManagementExamples,
  cacheStatisticsExamples,
  cacheDebuggingExamples,
  cacheInvalidationHooksExample,
  performanceOptimizationExamples
};