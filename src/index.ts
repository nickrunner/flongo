// Main exports for flongo package

export { FlongoCollection, FlongoCollectionOptions } from "./flongoCollection";
export { CachedFlongoCollection, CachedFlongoCollectionOptions } from "./cachedFlongoCollection";
export { FlongoQuery, FlongoQueryBuilder } from "./flongoQuery";
export { initializeFlongo, FlongoConfig, flongoClient, flongoDb } from "./flongo";
export { Error404, Error400 } from "./errors";
export {
  Entity,
  DbRecord,
  Pagination,
  Coordinates,
  Bounds,
  Event,
  EventName,
  EventRecord,
  Logic,
  SortDirection,
  ColRange,
  ColExpression,
  ICollectionQuery,
  ICollection,
  Repository,
  CacheOptions,
  CachedCollectionOptions
} from "./types";

// Cache exports
export {
  CacheStore,
  CacheEntry,
  CacheStats,
  CacheStoreOptions,
  BaseCacheStore,
  MemoryCache,
  MemoryCacheOptions,
  CacheKeyGenerator,
  CacheKeyOptions,
  InvalidationStrategy,
  InvalidationRule,
  InvalidationOptions,
  CacheInvalidator,
  TTLStrategy,
  LRUStrategy,
  CacheConfig,
  CacheMode,
  CacheProviderConfig,
  CacheConfiguration,
  createDefaultConfig,
  createProductionConfig,
  createDevelopmentConfig,
  DetailedCacheStats,
  CacheMetrics,
  CacheStatsCollector,
  CacheMonitor,
  getGlobalCacheMonitor,
  resetGlobalCacheMonitor
} from "./cache";

// Write-through and cache management exports
export { WriteThrough, AtomicOperationType, AtomicOperationData } from "./cache/writeThrough";
export { InvalidationStrategy as CacheInvalidationStrategy } from "./cache/invalidationStrategy";
export { CacheManager, CacheDebugInfo, ConsistencyCheckResult } from "./cache/cacheManager";