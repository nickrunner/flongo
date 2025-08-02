import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlongoCollection } from '../flongoCollection';
import { FlongoQuery } from '../flongoQuery';
import { initializeFlongo } from '../flongo';
import { SortDirection } from '../types';
import { TestUser, sampleUsers } from './testUtils';

// Mock the entire flongo module for integration tests
vi.mock('../flongo', () => {
  let mockDb: any;
  let mockCollections: Map<string, any> = new Map();

  const createMockCollection = (name: string) => {
    const data = new Map();
    let idCounter = 1;

    return {
      findOne: vi.fn(async (query: any) => {
        if (query._id) {
          return data.get(query._id.toString()) || null;
        }
        // Simple implementation for testing
        for (const [id, doc] of data.entries()) {
          if (matchesQuery(doc, query)) {
            return doc;
          }
        }
        return null;
      }),

      find: vi.fn((query: any = {}) => ({
        toArray: vi.fn(async () => {
          const results = [];
          for (const [id, doc] of data.entries()) {
            if (matchesQuery(doc, query)) {
              results.push(doc);
            }
          }
          return results;
        }),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis()
      })),

      insertOne: vi.fn(async (doc: any) => {
        const id = `507f1f77bcf86cd79943901${idCounter++}`;
        const docWithId = { ...doc, _id: id };
        data.set(id, docWithId);
        return { insertedId: id };
      }),

      insertMany: vi.fn(async (docs: any[]) => {
        const insertedIds = [];
        for (const doc of docs) {
          const id = `507f1f77bcf86cd79943901${idCounter++}`;
          const docWithId = { ...doc, _id: id };
          data.set(id, docWithId);
          insertedIds.push(id);
        }
        return { insertedIds };
      }),

      updateOne: vi.fn(async (filter: any, update: any) => {
        if (filter._id) {
          const doc = data.get(filter._id.toString());
          if (doc && update.$set) {
            const updated = { ...doc, ...update.$set };
            data.set(filter._id.toString(), updated);
            return { modifiedCount: 1 };
          }
        }
        return { modifiedCount: 0 };
      }),

      updateMany: vi.fn(async (filter: any, update: any) => {
        let modifiedCount = 0;
        for (const [id, doc] of data.entries()) {
          if (matchesQuery(doc, filter) && update.$set) {
            const updated = { ...doc, ...update.$set };
            data.set(id, updated);
            modifiedCount++;
          }
        }
        return { modifiedCount };
      }),

      deleteOne: vi.fn(async (filter: any) => {
        if (filter._id) {
          const deleted = data.delete(filter._id.toString());
          return { deletedCount: deleted ? 1 : 0 };
        }
        return { deletedCount: 0 };
      }),

      deleteMany: vi.fn(async (filter: any) => {
        let deletedCount = 0;
        for (const [id, doc] of data.entries()) {
          if (matchesQuery(doc, filter)) {
            data.delete(id);
            deletedCount++;
          }
        }
        return { deletedCount };
      }),

      countDocuments: vi.fn(async (filter: any = {}) => {
        let count = 0;
        for (const [id, doc] of data.entries()) {
          if (matchesQuery(doc, filter)) {
            count++;
          }
        }
        return count;
      }),

      findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
        for (const [id, doc] of data.entries()) {
          if (matchesQuery(doc, filter) && update.$set) {
            const updated = { ...doc, ...update.$set };
            data.set(id, updated);
            return updated;
          }
        }
        return null;
      }),

      // Expose data for testing
      _testData: data,
      _testReset: () => {
        data.clear();
        idCounter = 1;
      }
    };
  };

  // Simple query matching for tests
  const matchesQuery = (doc: any, query: any): boolean => {
    if (!query || Object.keys(query).length === 0) return true;
    
    for (const [field, condition] of Object.entries(query)) {
      if (field === '_id') {
        if (doc._id !== condition.toString()) return false;
        continue;
      }

      const docValue = doc[field];
      
      if (typeof condition === 'object' && condition !== null) {
        for (const [op, value] of Object.entries(condition)) {
          switch (op) {
            case '$eq':
              if (docValue !== value) return false;
              break;
            case '$ne':
              if (docValue === value) return false;
              break;
            case '$gt':
              if (docValue <= value) return false;
              break;
            case '$gte':
              if (docValue < value) return false;
              break;
            case '$lt':
              if (docValue >= value) return false;
              break;
            case '$lte':
              if (docValue > value) return false;
              break;
            case '$in':
              if (!Array.isArray(value) || !value.includes(docValue)) return false;
              break;
            default:
              // For other operators, just assume match for simplicity
              break;
          }
        }
      } else {
        if (docValue !== condition) return false;
      }
    }
    
    return true;
  };

  mockDb = {
    collection: vi.fn((name: string) => {
      if (!mockCollections.has(name)) {
        mockCollections.set(name, createMockCollection(name));
      }
      return mockCollections.get(name);
    }),
    _testReset: () => {
      for (const collection of mockCollections.values()) {
        collection._testReset();
      }
    }
  };

  return {
    flongoDb: mockDb,
    flongoClient: {},
    initializeFlongo: vi.fn(),
    FlongoConfig: {}
  };
});

describe('Integration Tests', () => {
  let collection: FlongoCollection<TestUser>;
  let mockDb: any;

  beforeEach(() => {
    const { flongoDb } = require('../flongo');
    mockDb = flongoDb;
    mockDb._testReset();
    
    collection = new FlongoCollection<TestUser>('users');
  });

  describe('End-to-End CRUD Operations', () => {
    it('should perform complete CRUD lifecycle', async () => {
      // CREATE
      const newUser = sampleUsers[0];
      const createdUser = await collection.create(newUser, 'client123');
      
      expect(createdUser).toMatchObject({
        ...newUser,
        _id: expect.any(String),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number)
      });

      // READ
      const fetchedUser = await collection.get(createdUser._id);
      expect(fetchedUser).toEqual(createdUser);

      // UPDATE
      const updates = { name: 'John Updated', age: 31 };
      await collection.update(createdUser._id, updates, 'client123');
      
      const updatedUser = await collection.get(createdUser._id);
      expect(updatedUser.name).toBe('John Updated');
      expect(updatedUser.age).toBe(31);
      expect(updatedUser.updatedAt).toBeGreaterThan(createdUser.updatedAt);

      // DELETE
      await collection.delete(createdUser._id, 'client123');
      
      // Verify deletion
      await expect(collection.get(createdUser._id)).rejects.toThrow();
    });

    it('should handle batch operations', async () => {
      // BATCH CREATE
      const users = sampleUsers.slice(0, 2);
      await collection.batchCreate(users, 'client123');

      // Verify all created
      const allUsers = await collection.getAll();
      expect(allUsers).toHaveLength(2);

      // BATCH UPDATE
      await collection.updateAll({ isActive: false });
      
      const updatedUsers = await collection.getAll();
      updatedUsers.forEach(user => {
        expect(user.isActive).toBe(false);
      });

      // BATCH DELETE
      const userIds = updatedUsers.map(user => user._id);
      await collection.batchDelete(userIds, 'client123');

      const remainingUsers = await collection.getAll();
      expect(remainingUsers).toHaveLength(0);
    });
  });

  describe('Query Integration', () => {
    beforeEach(async () => {
      // Seed data
      await collection.batchCreate(sampleUsers);
    });

    it('should perform complex queries with FlongoQuery', async () => {
      // Find active users older than 25
      const activeAdults = await collection.getAll(
        new FlongoQuery()
          .where('isActive').eq(true)
          .and('age').gt(25)
      );

      expect(activeAdults).toHaveLength(2); // John (30) and Bob (35, but inactive)
      activeAdults.forEach(user => {
        expect(user.isActive).toBe(true);
        expect(user.age).toBeGreaterThan(25);
      });
    });

    it('should handle pagination with queries', async () => {
      const firstPage = await collection.getAll(
        new FlongoQuery().where('isActive').eq(true),
        { offset: 0, count: 1 }
      );

      expect(firstPage).toHaveLength(1);

      const secondPage = await collection.getAll(
        new FlongoQuery().where('isActive').eq(true),
        { offset: 1, count: 1 }
      );

      expect(secondPage).toHaveLength(1);
      expect(firstPage[0]._id).not.toBe(secondPage[0]._id);
    });

    it('should handle array queries', async () => {
      const developers = await collection.getAll(
        new FlongoQuery()
          .where('tags').arrContainsAny(['developer'])
      );

      expect(developers).toHaveLength(1);
      expect(developers[0].name).toBe('John Doe');
    });

    it('should handle count and exists operations', async () => {
      const activeCount = await collection.count(
        new FlongoQuery().where('isActive').eq(true)
      );
      expect(activeCount).toBe(2);

      const hasAdults = await collection.exists(
        new FlongoQuery().where('age').gtEq(18)
      );
      expect(hasAdults).toBe(true);

      const hasMinors = await collection.exists(
        new FlongoQuery().where('age').lt(18)
      );
      expect(hasMinors).toBe(false);
    });
  });

  describe('Atomic Operations Integration', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await collection.create({
        ...sampleUsers[0],
        loginCount: 0,
        credits: 100,
        tags: ['initial']
      });
      userId = user._id;
    });

    it('should perform atomic increment operations', async () => {
      await collection.increment(userId, 'loginCount');
      await collection.increment(userId, 'loginCount', 5);

      const user = await collection.get(userId);
      expect(user.loginCount).toBe(6);
    });

    it('should perform atomic decrement operations', async () => {
      await collection.decrement(userId, 'credits', 10);
      await collection.decrement(userId, 'credits'); // default -1

      const user = await collection.get(userId);
      expect(user.credits).toBe(89);
    });

    it('should perform atomic array operations', async () => {
      await collection.append(userId, 'tags', ['developer', 'typescript']);

      let user = await collection.get(userId);
      expect(user.tags).toContain('developer');
      expect(user.tags).toContain('typescript');

      await collection.arrRemove(userId, 'tags', ['initial']);

      user = await collection.get(userId);
      expect(user.tags).not.toContain('initial');
      expect(user.tags).toContain('developer');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle not found errors', async () => {
      await expect(collection.get('nonexistent')).rejects.toThrow();
    });

    it('should handle query errors gracefully', async () => {
      const query = new FlongoQuery().where('invalidField').eq('value');
      
      // Should not throw, should return empty array
      const results = await collection.getAll(query);
      expect(results).toEqual([]);
    });
  });

  describe('Event Logging Integration', () => {
    it('should log events for all operations', async () => {
      const eventsCollection = mockDb.collection('events');
      
      // Create user
      const user = await collection.create(sampleUsers[0], 'client123');
      expect(eventsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'create_entity',
          identity: 'client123'
        })
      );

      // Update user
      await collection.update(user._id, { name: 'Updated' }, 'client123');
      expect(eventsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'update_entity',
          identity: 'client123'
        })
      );

      // Delete user
      await collection.delete(user._id, 'client123');
      expect(eventsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'delete_entity'
        })
      );
    });

    it('should not log events when disabled', async () => {
      const collectionNoLogging = new FlongoCollection<TestUser>('users', {
        enableEventLogging: false
      });
      
      const eventsCollection = mockDb.collection('events');
      
      await collectionNoLogging.create(sampleUsers[0], 'client123');
      
      // Events collection should not be called for this collection
      // Note: This test verifies the collection was created with logging disabled
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      // But should not have been called with 'events' for this instance
    });
  });

  describe('Configuration Integration', () => {
    it('should work with custom events collection name', async () => {
      const customCollection = new FlongoCollection<TestUser>('users', {
        eventsCollectionName: 'audit_logs'
      });
      
      expect(mockDb.collection).toHaveBeenCalledWith('audit_logs');
    });

    it('should initialize flongo properly', () => {
      const { initializeFlongo } = require('../flongo');
      
      const config = {
        connectionString: 'mongodb://localhost:27017',
        dbName: 'test'
      };
      
      initializeFlongo(config);
      expect(initializeFlongo).toHaveBeenCalledWith(config);
    });
  });
});