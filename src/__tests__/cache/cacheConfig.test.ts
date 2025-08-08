import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  CacheConfiguration,
  createDefaultConfig,
  createProductionConfig,
  createDevelopmentConfig
} from '../../cache/cacheConfig';
import { InvalidationStrategy } from '../../cache/cacheStrategies';

describe('CacheConfiguration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(() => {
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });
  
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = new CacheConfiguration();
      
      expect(config.enabled).toBe(false);
      expect(config.providerType).toBe('memory');
      expect(config.maxEntries).toBe(10000);
      expect(config.maxMemoryMB).toBe(100);
      expect(config.defaultTTL).toBe(300);
      expect(config.checkInterval).toBe(60);
      expect(config.enableStats).toBe(true);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.Smart);
      expect(config.debug).toBe(false);
    });
    
    it('should merge user config with defaults', () => {
      const config = new CacheConfiguration({
        enabled: true,
        maxEntries: 5000,
        defaultTTL: 600
      });
      
      expect(config.enabled).toBe(true);
      expect(config.maxEntries).toBe(5000);
      expect(config.defaultTTL).toBe(600);
      expect(config.maxMemoryMB).toBe(100);
    });
    
    it('should handle provider config', () => {
      const config = new CacheConfiguration({
        provider: {
          type: 'redis',
          connectionString: 'redis://localhost:6379',
          options: { db: 1 }
        }
      });
      
      expect(config.providerType).toBe('redis');
      expect(config.connectionString).toBe('redis://localhost:6379');
      expect(config.providerOptions).toEqual({ db: 1 });
    });
    
    it('should handle custom TTLs', () => {
      const config = new CacheConfiguration({
        customTTLs: {
          'flongo:users:*': 600,
          'flongo:posts:*': 120
        }
      });
      
      expect(config.customTTLs).toEqual({
        'flongo:users:*': 600,
        'flongo:posts:*': 120
      });
    });
    
    it('should handle warmup queries', () => {
      const warmupQueries = [
        {
          collection: 'users',
          operation: 'getAll'
        }
      ];
      
      const config = new CacheConfiguration({
        warmupQueries
      });
      
      expect(config.warmupQueries).toEqual(warmupQueries);
    });
  });
  
  describe('setters', () => {
    let config: CacheConfiguration;
    
    beforeEach(() => {
      config = new CacheConfiguration();
    });
    
    it('should set enabled', () => {
      config.setEnabled(true);
      expect(config.enabled).toBe(true);
    });
    
    it('should set provider', () => {
      config.setProvider({
        type: 'redis',
        connectionString: 'redis://localhost'
      });
      
      expect(config.providerType).toBe('redis');
      expect(config.connectionString).toBe('redis://localhost');
    });
    
    it('should validate max entries', () => {
      expect(() => config.setMaxEntries(0)).toThrow('maxEntries must be greater than 0');
      expect(() => config.setMaxEntries(-1)).toThrow('maxEntries must be greater than 0');
      
      config.setMaxEntries(1000);
      expect(config.maxEntries).toBe(1000);
    });
    
    it('should validate max memory', () => {
      expect(() => config.setMaxMemoryMB(0)).toThrow('maxMemoryMB must be greater than 0');
      expect(() => config.setMaxMemoryMB(-1)).toThrow('maxMemoryMB must be greater than 0');
      
      config.setMaxMemoryMB(50);
      expect(config.maxMemoryMB).toBe(50);
    });
    
    it('should validate default TTL', () => {
      expect(() => config.setDefaultTTL(-1)).toThrow('defaultTTL must be non-negative');
      
      config.setDefaultTTL(0);
      expect(config.defaultTTL).toBe(0);
      
      config.setDefaultTTL(600);
      expect(config.defaultTTL).toBe(600);
    });
    
    it('should validate check interval', () => {
      expect(() => config.setCheckInterval(-1)).toThrow('checkInterval must be non-negative');
      
      config.setCheckInterval(0);
      expect(config.checkInterval).toBe(0);
      
      config.setCheckInterval(120);
      expect(config.checkInterval).toBe(120);
    });
    
    it('should set invalidation strategy', () => {
      config.setInvalidationStrategy(InvalidationStrategy.TTL);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.TTL);
    });
    
    it('should set custom TTL', () => {
      config.setCustomTTL('flongo:users:*', 600);
      expect(config.customTTLs).toEqual({
        'flongo:users:*': 600
      });
      
      config.setCustomTTL('flongo:posts:*', 120);
      expect(config.customTTLs).toEqual({
        'flongo:users:*': 600,
        'flongo:posts:*': 120
      });
    });
    
    it('should add warmup query', () => {
      config.addWarmupQuery({
        collection: 'users',
        operation: 'getAll'
      });
      
      expect(config.warmupQueries).toHaveLength(1);
      
      config.addWarmupQuery({
        collection: 'posts',
        operation: 'count'
      });
      
      expect(config.warmupQueries).toHaveLength(2);
    });
    
    it('should set debug', () => {
      config.setDebug(true);
      expect(config.debug).toBe(true);
    });
  });
  
  describe('fromEnvironment', () => {
    it('should read config from environment variables', () => {
      process.env.FLONGO_CACHE_ENABLED = 'true';
      process.env.FLONGO_CACHE_PROVIDER = 'redis';
      process.env.FLONGO_CACHE_CONNECTION = 'redis://localhost:6379';
      process.env.FLONGO_CACHE_MAX_ENTRIES = '5000';
      process.env.FLONGO_CACHE_MAX_MEMORY_MB = '200';
      process.env.FLONGO_CACHE_DEFAULT_TTL = '600';
      process.env.FLONGO_CACHE_CHECK_INTERVAL = '120';
      process.env.FLONGO_CACHE_ENABLE_STATS = 'false';
      process.env.FLONGO_CACHE_INVALIDATION_STRATEGY = 'ttl';
      process.env.FLONGO_CACHE_DEBUG = 'true';
      
      const config = CacheConfiguration.fromEnvironment();
      
      expect(config.enabled).toBe(true);
      expect(config.providerType).toBe('redis');
      expect(config.connectionString).toBe('redis://localhost:6379');
      expect(config.maxEntries).toBe(5000);
      expect(config.maxMemoryMB).toBe(200);
      expect(config.defaultTTL).toBe(600);
      expect(config.checkInterval).toBe(120);
      expect(config.enableStats).toBe(false);
      expect(config.invalidationStrategy).toBe('ttl');
      expect(config.debug).toBe(true);
    });
    
    it('should handle partial environment config', () => {
      process.env.FLONGO_CACHE_ENABLED = 'true';
      process.env.FLONGO_CACHE_MAX_ENTRIES = '2000';
      
      const config = CacheConfiguration.fromEnvironment();
      
      expect(config.enabled).toBe(true);
      expect(config.maxEntries).toBe(2000);
      expect(config.providerType).toBe('memory');
      expect(config.defaultTTL).toBe(300);
    });
  });
  
  describe('validate', () => {
    it('should validate valid config', () => {
      const config = new CacheConfiguration();
      const errors = config.validate();
      
      expect(errors).toHaveLength(0);
    });
    
    it('should catch invalid max entries', () => {
      const config = new CacheConfiguration({
        maxEntries: -1
      });
      
      const errors = config.validate();
      expect(errors).toContain('maxEntries must be greater than 0');
    });
    
    it('should catch invalid max memory', () => {
      const config = new CacheConfiguration({
        maxMemoryMB: 0
      });
      
      const errors = config.validate();
      expect(errors).toContain('maxMemoryMB must be greater than 0');
    });
    
    it('should catch invalid TTL', () => {
      const config = new CacheConfiguration({
        defaultTTL: -10
      });
      
      const errors = config.validate();
      expect(errors).toContain('defaultTTL must be non-negative');
    });
    
    it('should catch invalid provider', () => {
      const config = new CacheConfiguration({
        provider: {
          type: 'invalid' as any
        }
      });
      
      const errors = config.validate();
      expect(errors).toContain('Invalid provider type: invalid');
    });
    
    it('should require connection string for redis', () => {
      const config = new CacheConfiguration({
        provider: {
          type: 'redis'
        }
      });
      
      const errors = config.validate();
      expect(errors).toContain('Connection string required for redis provider');
    });
    
    it('should require connection string for memcached', () => {
      const config = new CacheConfiguration({
        provider: {
          type: 'memcached'
        }
      });
      
      const errors = config.validate();
      expect(errors).toContain('Connection string required for memcached provider');
    });
  });
  
  describe('toJSON', () => {
    it('should export config as JSON', () => {
      const config = new CacheConfiguration({
        enabled: true,
        maxEntries: 5000
      });
      
      const json = config.toJSON();
      
      expect(json.enabled).toBe(true);
      expect(json.maxEntries).toBe(5000);
      expect(json.provider).toEqual({ type: 'memory' });
    });
  });
});

describe('Config presets', () => {
  it('should create default config', () => {
    const config = createDefaultConfig();
    
    expect(config.enabled).toBe(false);
    expect(config.maxEntries).toBe(10000);
    expect(config.defaultTTL).toBe(300);
  });
  
  it('should create production config', () => {
    const config = createProductionConfig();
    
    expect(config.enabled).toBe(true);
    expect(config.maxEntries).toBe(50000);
    expect(config.maxMemoryMB).toBe(500);
    expect(config.defaultTTL).toBe(600);
    expect(config.checkInterval).toBe(120);
  });
  
  it('should create development config', () => {
    const config = createDevelopmentConfig();
    
    expect(config.enabled).toBe(true);
    expect(config.maxEntries).toBe(1000);
    expect(config.maxMemoryMB).toBe(50);
    expect(config.defaultTTL).toBe(60);
    expect(config.checkInterval).toBe(30);
    expect(config.debug).toBe(true);
  });
});