import { describe, it, expect } from 'vitest';
import { CacheKeyGenerator } from '../../cache/cacheKeyGenerator';
import { SortDirection } from '../../types';

describe('CacheKeyGenerator', () => {
  describe('generate', () => {
    it('should generate simple keys for id-based operations', () => {
      const key = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'get',
        id: '123'
      });
      
      expect(key).toBe('flongo:users:get:123');
    });
    
    it('should generate hashed keys for queries', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'status', val: 'active' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'status', val: 'active' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key1).toBe(key2);
      expect(key1).toContain('flongo:users:getAll:');
    });
    
    it('should generate different keys for different queries', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'status', val: 'active' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'status', val: 'inactive' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key1).not.toBe(key2);
    });
    
    it('should include pagination in the key', () => {
      const key = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getSome',
        query: {
          expressions: [],
          ranges: [],
          orQueries: [],
          andQueries: []
        },
        pagination: {
          offset: 10,
          count: 20
        }
      });
      
      expect(key).toContain('p10-20');
    });
    
    it('should handle additional parameters', () => {
      const key = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'custom',
        additionalParams: {
          foo: 'bar',
          baz: 42
        }
      });
      
      expect(key).toContain('flongo:users:custom:');
    });
    
    it('should normalize query order for consistent keys', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'b', val: '2' },
            { op: '==', key: 'a', val: '1' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'a', val: '1' },
            { op: '==', key: 'b', val: '2' }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key1).toBe(key2);
    });
    
    it('should handle complex nested queries', () => {
      const key = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'status', val: 'active' }
          ],
          ranges: [
            { key: 'age', start: '18', end: '65' }
          ],
          orderField: 'createdAt',
          orderDirection: SortDirection.Descending,
          orQueries: [
            {
              expressions: [
                { op: '==', key: 'role', val: 'admin' }
              ],
              ranges: [],
              orQueries: [],
              andQueries: []
            }
          ],
          andQueries: []
        }
      });
      
      expect(key).toBeTruthy();
      expect(key).toContain('flongo:users:getAll:');
    });
  });
  
  describe('generatePattern', () => {
    it('should generate collection pattern', () => {
      const pattern = CacheKeyGenerator.generatePattern('users');
      expect(pattern).toBe('flongo:users*');
    });
    
    it('should generate operation pattern', () => {
      const pattern = CacheKeyGenerator.generatePattern('users', 'get');
      expect(pattern).toBe('flongo:users:get*');
    });
  });
  
  describe('parseKey', () => {
    it('should parse valid flongo keys', () => {
      const parsed = CacheKeyGenerator.parseKey('flongo:users:get:123');
      
      expect(parsed).toEqual({
        collection: 'users',
        operation: 'get',
        identifier: '123'
      });
    });
    
    it('should handle complex identifiers', () => {
      const parsed = CacheKeyGenerator.parseKey('flongo:users:getAll:abc123:p10-20');
      
      expect(parsed).toEqual({
        collection: 'users',
        operation: 'getAll',
        identifier: 'abc123:p10-20'
      });
    });
    
    it('should return empty object for non-flongo keys', () => {
      const parsed = CacheKeyGenerator.parseKey('other:key:format');
      expect(parsed).toEqual({});
    });
  });
  
  describe('isFlongoKey', () => {
    it('should identify flongo keys', () => {
      expect(CacheKeyGenerator.isFlongoKey('flongo:users:get:123')).toBe(true);
      expect(CacheKeyGenerator.isFlongoKey('flongo:anything')).toBe(true);
    });
    
    it('should reject non-flongo keys', () => {
      expect(CacheKeyGenerator.isFlongoKey('other:key')).toBe(false);
      expect(CacheKeyGenerator.isFlongoKey('random')).toBe(false);
    });
  });
  
  describe('getCollectionFromKey', () => {
    it('should extract collection from key', () => {
      const collection = CacheKeyGenerator.getCollectionFromKey('flongo:users:get:123');
      expect(collection).toBe('users');
    });
    
    it('should return undefined for invalid keys', () => {
      const collection = CacheKeyGenerator.getCollectionFromKey('invalid:key');
      expect(collection).toBeUndefined();
    });
  });
  
  describe('getOperationFromKey', () => {
    it('should extract operation from key', () => {
      const operation = CacheKeyGenerator.getOperationFromKey('flongo:users:get:123');
      expect(operation).toBe('get');
    });
    
    it('should return undefined for invalid keys', () => {
      const operation = CacheKeyGenerator.getOperationFromKey('invalid:key');
      expect(operation).toBeUndefined();
    });
  });
  
  describe('value normalization', () => {
    it('should handle null and undefined values', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'field', val: null }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'field', val: undefined }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key1).not.toBe(key2);
    });
    
    it('should handle date values', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      
      const key = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: '==', key: 'createdAt', val: date }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key).toBeTruthy();
    });
    
    it('should normalize array values', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: 'in', key: 'tags', val: ['b', 'a', 'c'] }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        query: {
          expressions: [
            { op: 'in', key: 'tags', val: ['c', 'a', 'b'] }
          ],
          ranges: [],
          orQueries: [],
          andQueries: []
        }
      });
      
      expect(key1).toBe(key2);
    });
    
    it('should normalize nested objects', () => {
      const key1 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        additionalParams: {
          b: 2,
          a: 1,
          nested: {
            y: 'bar',
            x: 'foo'
          }
        }
      });
      
      const key2 = CacheKeyGenerator.generate({
        collection: 'users',
        operation: 'getAll',
        additionalParams: {
          a: 1,
          b: 2,
          nested: {
            x: 'foo',
            y: 'bar'
          }
        }
      });
      
      expect(key1).toBe(key2);
    });
  });
});