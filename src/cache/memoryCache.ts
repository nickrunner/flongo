import { BaseCacheStore, CacheEntry, CacheStoreOptions } from './cacheStore';

export interface MemoryCacheOptions extends CacheStoreOptions {
  checkInterval?: number;
  maxMemoryMB?: number;
}

export class MemoryCache<T = any> extends BaseCacheStore<T> {
  private cache: Map<string, CacheEntry<T>>;
  private lruOrder: string[];
  private cleanupInterval?: NodeJS.Timeout;
  private readonly memoryOptions: Required<MemoryCacheOptions>;
  private readonly locks: Map<string, Promise<void>>;
  
  constructor(options: MemoryCacheOptions = {}) {
    super(options);
    this.cache = new Map();
    this.lruOrder = [];
    this.locks = new Map();
    this.memoryOptions = {
      ...this.options,
      checkInterval: options.checkInterval ?? 60000,
      maxMemoryMB: options.maxMemoryMB ?? 100
    };
    
    if (this.memoryOptions.checkInterval > 0) {
      this.startCleanupInterval();
    }
  }
  
  async get(key: string): Promise<T | undefined> {
    await this.waitForLock(key);
    
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.incrementStat('misses');
      return undefined;
    }
    
    if (this.isExpired(entry)) {
      await this.delete(key);
      this.incrementStat('misses');
      return undefined;
    }
    
    this.updateLRU(key);
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    
    this.incrementStat('hits');
    return entry.value;
  }
  
  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const lock = this.acquireLock(key);
    
    try {
      await lock;
      
      const ttl = ttlSeconds ?? this.options.defaultTTL;
      const now = Date.now();
      
      await this.ensureCapacity();
      
      const entry: CacheEntry<T> = {
        value,
        ttl: ttl > 0 ? ttl * 1000 : undefined,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 0
      };
      
      this.cache.set(key, entry);
      this.updateLRU(key);
      this.incrementStat('sets');
      
      await this.checkMemoryLimit();
    } finally {
      this.releaseLock(key);
    }
  }
  
  async delete(key: string): Promise<boolean> {
    const lock = this.acquireLock(key);
    
    try {
      await lock;
      
      const existed = this.cache.has(key);
      
      if (existed) {
        const entry = this.cache.get(key);
        this.cache.delete(key);
        this.removeLRU(key);
        this.incrementStat('deletes');
        
        if (entry && this.options.onEviction) {
          this.options.onEviction(key, entry.value);
        }
      }
      
      return existed;
    } finally {
      this.releaseLock(key);
    }
  }
  
  async clear(): Promise<void> {
    const keys = Array.from(this.cache.keys());
    
    for (const key of keys) {
      await this.waitForLock(key);
    }
    
    this.cache.clear();
    this.lruOrder = [];
    this.incrementStat('clears');
  }
  
  async has(key: string): Promise<boolean> {
    await this.waitForLock(key);
    
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (this.isExpired(entry)) {
      await this.delete(key);
      return false;
    }
    
    return true;
  }
  
  async size(): Promise<number> {
    return this.cache.size;
  }
  
  async keys(): Promise<string[]> {
    const validKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isExpired(entry)) {
        validKeys.push(key);
      }
    }
    
    return validKeys;
  }
  
  async getMemoryUsage(): Promise<number> {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += this.estimateSize(key, entry);
    }
    
    return totalSize;
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
    this.lruOrder = [];
    this.locks.clear();
  }
  
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl) {
      return false;
    }
    
    return Date.now() - entry.createdAt > entry.ttl;
  }
  
  private updateLRU(key: string): void {
    const index = this.lruOrder.indexOf(key);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
    this.lruOrder.push(key);
  }
  
  private removeLRU(key: string): void {
    const index = this.lruOrder.indexOf(key);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
  }
  
  private async ensureCapacity(): Promise<void> {
    while (this.cache.size >= this.options.maxEntries && this.lruOrder.length > 0) {
      const keyToEvict = this.lruOrder[0];
      await this.delete(keyToEvict);
      this.incrementStat('evictions');
    }
  }
  
  private async checkMemoryLimit(): Promise<void> {
    const memoryUsageMB = (await this.getMemoryUsage()) / (1024 * 1024);
    
    while (memoryUsageMB > this.memoryOptions.maxMemoryMB && this.lruOrder.length > 0) {
      const keyToEvict = this.lruOrder[0];
      await this.delete(keyToEvict);
      this.incrementStat('evictions');
    }
  }
  
  private estimateSize(key: string, entry: CacheEntry<T>): number {
    let size = key.length * 2;
    size += 8 * 4;
    
    const value = entry.value;
    if (value === null || value === undefined) {
      return size;
    }
    
    if (typeof value === 'string') {
      size += value.length * 2;
    } else if (typeof value === 'number') {
      size += 8;
    } else if (typeof value === 'boolean') {
      size += 4;
    } else if (typeof value === 'object') {
      try {
        size += JSON.stringify(value).length * 2;
      } catch {
        size += 1024;
      }
    }
    
    return size;
  }
  
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpired();
    }, this.memoryOptions.checkInterval);
    
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
  
  private async cleanupExpired(): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }
  
  private acquireLock(key: string): Promise<void> {
    const existingLock = this.locks.get(key);
    
    if (existingLock) {
      const newLock = existingLock.then(() => this.createLockPromise());
      this.locks.set(key, newLock);
      return newLock;
    }
    
    const lock = this.createLockPromise();
    this.locks.set(key, lock);
    return lock;
  }
  
  private createLockPromise(): Promise<void> {
    return new Promise(resolve => {
      setImmediate(resolve);
    });
  }
  
  private releaseLock(key: string): void {
    this.locks.delete(key);
  }
  
  private async waitForLock(key: string): Promise<void> {
    const lock = this.locks.get(key);
    if (lock) {
      await lock;
    }
  }
}