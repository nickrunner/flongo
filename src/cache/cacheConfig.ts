import { InvalidationStrategy } from './cacheStrategies';

export interface CacheProviderConfig {
  type: 'memory' | 'redis' | 'memcached' | 'custom';
  connectionString?: string;
  options?: Record<string, any>;
}

export interface CacheConfig {
  enabled: boolean;
  provider: CacheProviderConfig;
  maxEntries: number;
  maxMemoryMB: number;
  defaultTTL: number;
  checkInterval: number;
  enableStats: boolean;
  invalidationStrategy: InvalidationStrategy;
  customTTLs?: Record<string, number>;
  warmupQueries?: Array<{
    collection: string;
    operation: string;
    query?: any;
    pagination?: any;
  }>;
  debug?: boolean;
}

export class CacheConfiguration {
  private static defaultConfig: CacheConfig = {
    enabled: false,
    provider: {
      type: 'memory'
    },
    maxEntries: 10000,
    maxMemoryMB: 100,
    defaultTTL: 300,
    checkInterval: 60,
    enableStats: true,
    invalidationStrategy: InvalidationStrategy.Smart,
    debug: false
  };
  
  private config: CacheConfig;
  
  constructor(config?: Partial<CacheConfig>) {
    this.config = this.mergeConfig(config);
  }
  
  private mergeConfig(userConfig?: Partial<CacheConfig>): CacheConfig {
    if (!userConfig) {
      return { ...CacheConfiguration.defaultConfig };
    }
    
    const merged: CacheConfig = {
      ...CacheConfiguration.defaultConfig,
      ...userConfig
    };
    
    if (userConfig.provider) {
      merged.provider = {
        ...CacheConfiguration.defaultConfig.provider,
        ...userConfig.provider
      };
    }
    
    if (userConfig.customTTLs) {
      merged.customTTLs = { ...userConfig.customTTLs };
    }
    
    if (userConfig.warmupQueries) {
      merged.warmupQueries = [...userConfig.warmupQueries];
    }
    
    return merged;
  }
  
  get enabled(): boolean {
    return this.config.enabled;
  }
  
  get providerType(): string {
    return this.config.provider.type;
  }
  
  get providerOptions(): Record<string, any> | undefined {
    return this.config.provider.options;
  }
  
  get connectionString(): string | undefined {
    return this.config.provider.connectionString;
  }
  
  get maxEntries(): number {
    return this.config.maxEntries;
  }
  
  get maxMemoryMB(): number {
    return this.config.maxMemoryMB;
  }
  
  get defaultTTL(): number {
    return this.config.defaultTTL;
  }
  
  get checkInterval(): number {
    return this.config.checkInterval;
  }
  
  get enableStats(): boolean {
    return this.config.enableStats;
  }
  
  get invalidationStrategy(): InvalidationStrategy {
    return this.config.invalidationStrategy;
  }
  
  get customTTLs(): Record<string, number> | undefined {
    return this.config.customTTLs;
  }
  
  get warmupQueries(): Array<any> | undefined {
    return this.config.warmupQueries;
  }
  
  get debug(): boolean {
    return this.config.debug || false;
  }
  
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
  
  setProvider(provider: CacheProviderConfig): void {
    this.config.provider = provider;
  }
  
  setMaxEntries(max: number): void {
    if (max <= 0) {
      throw new Error('maxEntries must be greater than 0');
    }
    this.config.maxEntries = max;
  }
  
  setMaxMemoryMB(max: number): void {
    if (max <= 0) {
      throw new Error('maxMemoryMB must be greater than 0');
    }
    this.config.maxMemoryMB = max;
  }
  
  setDefaultTTL(ttl: number): void {
    if (ttl < 0) {
      throw new Error('defaultTTL must be non-negative');
    }
    this.config.defaultTTL = ttl;
  }
  
  setCheckInterval(interval: number): void {
    if (interval < 0) {
      throw new Error('checkInterval must be non-negative');
    }
    this.config.checkInterval = interval;
  }
  
  setInvalidationStrategy(strategy: InvalidationStrategy): void {
    this.config.invalidationStrategy = strategy;
  }
  
  setCustomTTL(pattern: string, ttl: number): void {
    if (!this.config.customTTLs) {
      this.config.customTTLs = {};
    }
    this.config.customTTLs[pattern] = ttl;
  }
  
  addWarmupQuery(query: any): void {
    if (!this.config.warmupQueries) {
      this.config.warmupQueries = [];
    }
    this.config.warmupQueries.push(query);
  }
  
  setDebug(debug: boolean): void {
    this.config.debug = debug;
  }
  
  toJSON(): CacheConfig {
    return { ...this.config };
  }
  
  static fromEnvironment(): CacheConfiguration {
    const config: Partial<CacheConfig> = {};
    
    if (process.env.FLONGO_CACHE_ENABLED) {
      config.enabled = process.env.FLONGO_CACHE_ENABLED === 'true';
    }
    
    if (process.env.FLONGO_CACHE_PROVIDER) {
      config.provider = {
        type: process.env.FLONGO_CACHE_PROVIDER as any
      };
    }
    
    if (process.env.FLONGO_CACHE_CONNECTION) {
      if (!config.provider) {
        config.provider = { type: 'redis' };
      }
      config.provider.connectionString = process.env.FLONGO_CACHE_CONNECTION;
    }
    
    if (process.env.FLONGO_CACHE_MAX_ENTRIES) {
      config.maxEntries = parseInt(process.env.FLONGO_CACHE_MAX_ENTRIES, 10);
    }
    
    if (process.env.FLONGO_CACHE_MAX_MEMORY_MB) {
      config.maxMemoryMB = parseInt(process.env.FLONGO_CACHE_MAX_MEMORY_MB, 10);
    }
    
    if (process.env.FLONGO_CACHE_DEFAULT_TTL) {
      config.defaultTTL = parseInt(process.env.FLONGO_CACHE_DEFAULT_TTL, 10);
    }
    
    if (process.env.FLONGO_CACHE_CHECK_INTERVAL) {
      config.checkInterval = parseInt(process.env.FLONGO_CACHE_CHECK_INTERVAL, 10);
    }
    
    if (process.env.FLONGO_CACHE_ENABLE_STATS) {
      config.enableStats = process.env.FLONGO_CACHE_ENABLE_STATS === 'true';
    }
    
    if (process.env.FLONGO_CACHE_INVALIDATION_STRATEGY) {
      config.invalidationStrategy = process.env.FLONGO_CACHE_INVALIDATION_STRATEGY as InvalidationStrategy;
    }
    
    if (process.env.FLONGO_CACHE_DEBUG) {
      config.debug = process.env.FLONGO_CACHE_DEBUG === 'true';
    }
    
    return new CacheConfiguration(config);
  }
  
  validate(): string[] {
    const errors: string[] = [];
    
    if (this.config.maxEntries <= 0) {
      errors.push('maxEntries must be greater than 0');
    }
    
    if (this.config.maxMemoryMB <= 0) {
      errors.push('maxMemoryMB must be greater than 0');
    }
    
    if (this.config.defaultTTL < 0) {
      errors.push('defaultTTL must be non-negative');
    }
    
    if (this.config.checkInterval < 0) {
      errors.push('checkInterval must be non-negative');
    }
    
    const validProviders = ['memory', 'redis', 'memcached', 'custom'];
    if (!validProviders.includes(this.config.provider.type)) {
      errors.push(`Invalid provider type: ${this.config.provider.type}`);
    }
    
    if (this.config.provider.type === 'redis' || this.config.provider.type === 'memcached') {
      if (!this.config.provider.connectionString) {
        errors.push(`Connection string required for ${this.config.provider.type} provider`);
      }
    }
    
    const validStrategies = Object.values(InvalidationStrategy);
    if (!validStrategies.includes(this.config.invalidationStrategy)) {
      errors.push(`Invalid invalidation strategy: ${this.config.invalidationStrategy}`);
    }
    
    return errors;
  }
}

export function createDefaultConfig(): CacheConfig {
  return new CacheConfiguration().toJSON();
}

export function createProductionConfig(): CacheConfig {
  return new CacheConfiguration({
    enabled: true,
    provider: {
      type: 'memory'
    },
    maxEntries: 50000,
    maxMemoryMB: 500,
    defaultTTL: 600,
    checkInterval: 120,
    enableStats: true,
    invalidationStrategy: InvalidationStrategy.Smart
  }).toJSON();
}

export function createDevelopmentConfig(): CacheConfig {
  return new CacheConfiguration({
    enabled: true,
    provider: {
      type: 'memory'
    },
    maxEntries: 1000,
    maxMemoryMB: 50,
    defaultTTL: 60,
    checkInterval: 30,
    enableStats: true,
    invalidationStrategy: InvalidationStrategy.Smart,
    debug: true
  }).toJSON();
}