import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { ObjectId } from 'mongodb';
import { FlongoCollection } from '../flongoCollection';
import { FlongoQuery } from '../flongoQuery';
import { EventName } from '../types';
import { Error404 } from '../errors';
import { TestUser, sampleUsers, sampleUsersWithIds } from './testUtils';

// Mock the flongo module
vi.mock('../flongo', () => {
  const mockCollection = {
    findOne: vi.fn(),
    find: vi.fn(() => ({
      toArray: vi.fn(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis()
    })),
    insertOne: vi.fn(),
    insertMany: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn()
  };

  const mockDb = {
    collection: vi.fn(() => mockCollection)
  };

  return {
    flongoDb: mockDb,
    flongoClient: {},
    initializeFlongo: vi.fn()
  };
});

describe('FlongoCollection', () => {
  let collection: FlongoCollection<TestUser>;
  let mockDb: any;
  let mockCollection: any;
  let mockEventsCollection: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked db and collections
    const flongoModule = await import('../flongo');
    mockDb = flongoModule.flongoDb;
    
    // Create separate mock collections for data and events
    const mockCursor = {
      toArray: vi.fn().mockResolvedValue([]),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis()
    };
    
    mockCollection = {
      findOne: vi.fn(),
      find: vi.fn(() => mockCursor),
      insertOne: vi.fn().mockResolvedValue({ insertedId: 'mock-id' }),
      insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      countDocuments: vi.fn().mockResolvedValue(0),
      findOneAndUpdate: vi.fn()
    };

    mockEventsCollection = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: 'event-id' })
    };

    // Mock db.collection to return different collections based on name
    mockDb.collection.mockImplementation((name: string) => {
      if (name === 'events') {
        return mockEventsCollection;
      }
      return mockCollection;
    });

    collection = new FlongoCollection<TestUser>('users');
  });

  describe('Constructor', () => {
    it('should create collection with default options', () => {
      const coll = new FlongoCollection<TestUser>('users');
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockDb.collection).toHaveBeenCalledWith('events');
    });

    it('should create collection with custom options', () => {
      // Clear previous calls from beforeEach
      mockDb.collection.mockClear();
      
      const coll = new FlongoCollection<TestUser>('users', {
        enableEventLogging: false
      });
      
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      // Should not create events collection when logging disabled
      expect(mockDb.collection).toHaveBeenCalledTimes(1);
    });

    it('should create collection with custom events collection name', () => {
      const coll = new FlongoCollection<TestUser>('users', {
        eventsCollectionName: 'audit_logs'
      });
      
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockDb.collection).toHaveBeenCalledWith('audit_logs');
    });
  });

  describe('Read Operations', () => {
    describe('get', () => {
      it('should retrieve document by id', async () => {
        const mockUser = sampleUsersWithIds[0];
        mockCollection.findOne.mockResolvedValue(mockUser);

        const result = await collection.get('507f1f77bcf86cd799439010');

        expect(mockCollection.findOne).toHaveBeenCalledWith({
          _id: expect.any(Object)
        });
        expect(result).toEqual(mockUser);
      });

      it('should throw Error404 when document not found', async () => {
        mockCollection.findOne.mockResolvedValue(null);

        await expect(collection.get('nonexistent')).rejects.toThrow(Error404);
      });

      it('should convert ObjectId to string in result', async () => {
        const mockUser = {
          ...sampleUsersWithIds[0],
          _id: { toString: () => '507f1f77bcf86cd799439010' }
        };
        mockCollection.findOne.mockResolvedValue(mockUser);

        const result = await collection.get('507f1f77bcf86cd799439010');

        expect(result._id).toBe('507f1f77bcf86cd799439010');
      });
    });

    describe('getAll', () => {
      it('should retrieve all documents without query', async () => {
        const mockUsers = sampleUsersWithIds;
        mockCollection.find().toArray.mockResolvedValue(mockUsers);

        const result = await collection.getAll();

        expect(mockCollection.find).toHaveBeenCalledWith({}, {});
        expect(result).toEqual(mockUsers);
      });

      it('should retrieve documents with query', async () => {
        const mockUsers = [sampleUsersWithIds[0]];
        const query = new FlongoQuery().where('age').gtEq(18);
        mockCollection.find().toArray.mockResolvedValue(mockUsers);

        const result = await collection.getAll(query);

        expect(mockCollection.find).toHaveBeenCalledWith(
          { age: { $gte: 18 } },
          {}
        );
        expect(result).toEqual(mockUsers);
      });

      it('should retrieve documents with pagination', async () => {
        const mockUsers = sampleUsersWithIds.slice(0, 2);
        const pagination = { offset: 0, count: 2 };
        mockCollection.find().toArray.mockResolvedValue(mockUsers);

        const result = await collection.getAll(undefined, pagination);

        expect(mockCollection.find).toHaveBeenCalledWith(
          {},
          { skip: 0, limit: 2 }
        );
        expect(result).toEqual(mockUsers);
      });

      it('should handle errors gracefully', async () => {
        const error = new Error('Database error');
        mockCollection.find().toArray.mockRejectedValue(error);

        await expect(collection.getAll()).rejects.toThrow('Database error');
      });
    });

    describe('getSome', () => {
      it('should retrieve documents with required query and pagination', async () => {
        const mockUsers = [sampleUsersWithIds[0]];
        const query = new FlongoQuery().where('isActive').eq(true);
        const pagination = { offset: 0, count: 1 };
        mockCollection.find().toArray.mockResolvedValue(mockUsers);

        const result = await collection.getSome(query, pagination);

        expect(mockCollection.find).toHaveBeenCalledWith(
          { isActive: { $eq: true } },
          { skip: 0, limit: 1 }
        );
        expect(result).toEqual(mockUsers);
      });
    });

    describe('getFirst', () => {
      it('should retrieve first matching document', async () => {
        const mockUser = sampleUsersWithIds[0];
        const query = new FlongoQuery().where('name').eq('John Doe');
        mockCollection.findOne.mockResolvedValue(mockUser);

        const result = await collection.getFirst(query);

        expect(mockCollection.findOne).toHaveBeenCalledWith(
          { name: { $eq: 'John Doe' } },
          {}
        );
        expect(result).toEqual(mockUser);
      });
    });

    describe('count', () => {
      it('should count all documents without query', async () => {
        mockCollection.countDocuments.mockResolvedValue(3);

        const result = await collection.count();

        expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
        expect(result).toBe(3);
      });

      it('should count documents with query', async () => {
        const query = new FlongoQuery().where('isActive').eq(true);
        mockCollection.countDocuments.mockResolvedValue(2);

        const result = await collection.count(query);

        expect(mockCollection.countDocuments).toHaveBeenCalledWith({
          isActive: { $eq: true }
        });
        expect(result).toBe(2);
      });
    });

    describe('exists', () => {
      it('should return true when documents exist', async () => {
        const query = new FlongoQuery().where('email').eq('john@example.com');
        mockCollection.countDocuments.mockResolvedValue(1);

        const result = await collection.exists(query);

        expect(result).toBe(true);
      });

      it('should return false when no documents exist', async () => {
        const query = new FlongoQuery().where('email').eq('nonexistent@example.com');
        mockCollection.countDocuments.mockResolvedValue(0);

        const result = await collection.exists(query);

        expect(result).toBe(false);
      });

      it('should return false on error', async () => {
        const query = new FlongoQuery().where('email').eq('test@example.com');
        mockCollection.countDocuments.mockRejectedValue(new Error('DB Error'));

        const result = await collection.exists(query);

        expect(result).toBe(false);
      });
    });
  });

  describe('Create Operations', () => {
    describe('create', () => {
      it('should create a new document', async () => {
        const newUser = sampleUsers[0];
        const createdUser = sampleUsersWithIds[0];
        
        mockCollection.insertOne.mockResolvedValue({
          insertedId: '507f1f77bcf86cd799439010'
        });
        mockCollection.findOne.mockResolvedValue(createdUser);
        mockCollection.countDocuments.mockResolvedValue(1);
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        const result = await collection.create(newUser, 'client123');

        expect(mockCollection.insertOne).toHaveBeenCalledWith({
          ...newUser,
          createdBy: 'client123',
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
        expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
          name: EventName.CreateEntity,
          identity: 'client123',
          value: expect.objectContaining({
            id: createdUser._id,
            collectionType: 'users'
          }),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
        expect(result).toEqual(createdUser);
      });

      it('should handle creation errors', async () => {
        const newUser = sampleUsers[0];
        const error = new Error('Creation failed');
        mockCollection.insertOne.mockRejectedValue(error);

        await expect(collection.create(newUser)).rejects.toThrow('Creation failed');
      });
    });

    describe('batchCreate', () => {
      it('should create multiple documents and return ids', async () => {
        const newUsers = sampleUsers.slice(0, 2);
        mockCollection.insertMany.mockResolvedValue({
          insertedIds: { 0: new ObjectId('507f1f77bcf86cd799439011'), 1: new ObjectId('507f1f77bcf86cd799439012') }
        });
        mockCollection.countDocuments.mockResolvedValue(2);
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        const ids = await collection.batchCreate(newUsers, 'client123');

        expect(ids).toEqual([
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439012'
        ]);

        expect(mockCollection.insertMany).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              ...newUsers[0],
              createdBy: 'client123',
              createdAt: expect.any(Number),
              updatedAt: expect.any(Number)
            }),
            expect.objectContaining({
              ...newUsers[1],
              createdBy: 'client123',
              createdAt: expect.any(Number),
              updatedAt: expect.any(Number)
            })
          ])
        );
        expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
          name: EventName.BatchCreateEntities,
          identity: 'client123',
          value: expect.objectContaining({
            collectionType: 'users'
          }),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
      });

      it('should handle empty array gracefully', async () => {
        const ids = await collection.batchCreate([]);

        expect(ids).toEqual([]);
        expect(mockCollection.insertMany).not.toHaveBeenCalled();
      });
    });

    describe('createIfNotExists', () => {
      it('should insert document when it does not exist', async () => {
        const doc = { _id: 'cache-key-1', name: 'John Doe', email: 'john@example.com', age: 30, isActive: true };
        const returnedDoc = { _id: 'cache-key-1', name: 'John Doe', email: 'john@example.com', age: 30, isActive: true, createdBy: 'client123', createdAt: expect.any(Number), updatedAt: expect.any(Number) };
        mockCollection.findOneAndUpdate.mockResolvedValue(returnedDoc);

        const result = await collection.createIfNotExists(doc, 'client123');

        expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: 'cache-key-1' },
          { $setOnInsert: { name: 'John Doe', email: 'john@example.com', age: 30, isActive: true, createdBy: 'client123', createdAt: expect.any(Number), updatedAt: expect.any(Number) } },
          { upsert: true, returnDocument: 'after' }
        );
        expect(result._id).toBe('cache-key-1');
        expect(result.name).toBe('John Doe');
      });

      it('should return existing document without modifying it', async () => {
        const existingDoc = { _id: 'cache-key-1', name: 'Existing', email: 'existing@example.com', age: 25, isActive: true, createdAt: 1000, updatedAt: 1000 };
        mockCollection.findOneAndUpdate.mockResolvedValue(existingDoc);

        const result = await collection.createIfNotExists({ _id: 'cache-key-1', name: 'New Name', email: 'new@example.com', age: 30, isActive: false }, 'client123');

        expect(result.name).toBe('Existing');
        expect(result.createdAt).toBe(1000);
      });

      it('should work without clientId', async () => {
        const doc = { _id: 'key-1', name: 'Test', email: 'test@example.com', age: 20, isActive: true };
        mockCollection.findOneAndUpdate.mockResolvedValue({ ...doc, createdBy: undefined, createdAt: Date.now(), updatedAt: Date.now() });

        await collection.createIfNotExists(doc);

        expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: 'key-1' },
          { $setOnInsert: expect.objectContaining({ createdBy: undefined }) },
          { upsert: true, returnDocument: 'after' }
        );
      });
    });

    describe('createOrUpdate', () => {
      it('should insert document when it does not exist', async () => {
        const doc = { _id: 'cache-key-1', name: 'John Doe', email: 'john@example.com', age: 30, isActive: true };
        const returnedDoc = { _id: 'cache-key-1', name: 'John Doe', email: 'john@example.com', age: 30, isActive: true, createdBy: 'client123', createdAt: expect.any(Number), updatedAt: expect.any(Number), updatedBy: 'client123' };
        mockCollection.findOneAndUpdate.mockResolvedValue(returnedDoc);

        const result = await collection.createOrUpdate(doc, 'client123');

        expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: 'cache-key-1' },
          {
            $set: { name: 'John Doe', email: 'john@example.com', age: 30, isActive: true, updatedAt: expect.any(Number), updatedBy: 'client123' },
            $setOnInsert: { createdAt: expect.any(Number), createdBy: 'client123' }
          },
          { upsert: true, returnDocument: 'after' }
        );
        expect(result._id).toBe('cache-key-1');
      });

      it('should overwrite existing document', async () => {
        const updatedDoc = { _id: 'cache-key-1', name: 'Updated', email: 'updated@example.com', age: 35, isActive: false, createdAt: 1000, updatedAt: 2000, updatedBy: 'client123' };
        mockCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

        const result = await collection.createOrUpdate({ _id: 'cache-key-1', name: 'Updated', email: 'updated@example.com', age: 35, isActive: false }, 'client123');

        expect(result.name).toBe('Updated');
        expect(result.createdAt).toBe(1000);
        expect(result.updatedAt).toBe(2000);
      });

      it('should strip Entity timestamp fields from $set to avoid conflicts', async () => {
        const doc = { _id: 'key-1', name: 'Test', email: 'test@example.com', age: 20, isActive: true, createdAt: 9999, updatedAt: 9999 } as any;
        mockCollection.findOneAndUpdate.mockResolvedValue(doc);

        await collection.createOrUpdate(doc, 'client123');

        const call = mockCollection.findOneAndUpdate.mock.calls[0];
        const $set = call[1].$set;
        const $setOnInsert = call[1].$setOnInsert;

        // createdAt should only be in $setOnInsert, not in $set
        expect($set).not.toHaveProperty('createdAt');
        expect($set).not.toHaveProperty('createdBy');
        expect($setOnInsert).toHaveProperty('createdAt');
        expect($setOnInsert).toHaveProperty('createdBy');
      });

      it('should work without clientId', async () => {
        const doc = { _id: 'key-1', name: 'Test', email: 'test@example.com', age: 20, isActive: true };
        mockCollection.findOneAndUpdate.mockResolvedValue({ ...doc, updatedBy: undefined, createdAt: Date.now(), updatedAt: Date.now() });

        await collection.createOrUpdate(doc);

        expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: 'key-1' },
          {
            $set: expect.objectContaining({ updatedBy: undefined }),
            $setOnInsert: expect.objectContaining({ createdBy: undefined })
          },
          { upsert: true, returnDocument: 'after' }
        );
      });
    });
  });

  describe('Update Operations', () => {
    describe('update', () => {
      it('should update document by id', async () => {
        const updates = { name: 'John Updated' };
        mockCollection.updateOne.mockResolvedValue({});
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        await collection.update('507f1f77bcf86cd799439010', updates, 'client123');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $set: {
              updatedAt: expect.any(Number),
              updatedBy: 'client123',
              ...updates
            }
          }
        );
        expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
          name: EventName.UpdateEntity,
          identity: 'client123',
          value: expect.objectContaining({
            collectionType: 'users',
            id: '507f1f77bcf86cd799439010'
          }),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
      });

      it('should remove _id from updates to prevent overwriting', async () => {
        const updates = { _id: 'should-be-removed', name: 'John Updated' };
        mockCollection.updateOne.mockResolvedValue({});

        await collection.update('507f1f77bcf86cd799439010', updates);

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $set: {
              updatedAt: expect.any(Number),
              name: 'John Updated'
              // _id should not be present
            }
          }
        );
      });

      it('should handle update errors', async () => {
        const updates = { name: 'John Updated' };
        const error = new Error('Update failed');
        mockCollection.updateOne.mockRejectedValue(error);

        await expect(collection.update('123', updates)).rejects.toThrow('Update failed');
      });
    });

    describe('updateAll', () => {
      it('should update all documents matching query', async () => {
        const updates = { isActive: false };
        const query = new FlongoQuery().where('age').lt(18);
        mockCollection.updateMany.mockResolvedValue({});
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        await collection.updateAll(updates, query, 'client123');

        expect(mockCollection.updateMany).toHaveBeenCalledWith(
          { age: { $lt: 18 } },
          {
            $set: {
              updatedAt: expect.any(Number),
              updatedBy: 'client123',
              ...updates
            }
          }
        );
      });

      it('should update all documents when no query provided', async () => {
        const updates = { isActive: false };
        mockCollection.updateMany.mockResolvedValue({});

        await collection.updateAll(updates);

        expect(mockCollection.updateMany).toHaveBeenCalledWith(
          {},
          {
            $set: {
              updatedAt: expect.any(Number),
              updatedBy: undefined,
              ...updates
            }
          }
        );
      });
    });

    describe('updateFirst', () => {
      it('should update first matching document', async () => {
        const updates = { name: 'Updated Name' };
        const query = new FlongoQuery().where('isActive').eq(true);
        const updatedUser = sampleUsersWithIds[0];

        mockCollection.findOneAndUpdate.mockResolvedValue(updatedUser);

        const result = await collection.updateFirst(updates, query, 'client123');

        expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
          { isActive: { $eq: true } },
          {
            $set: {
              updatedAt: expect.any(Number),
              updatedBy: 'client123',
              ...updates
            }
          }
        );
        expect(result).toEqual(updatedUser);
      });

      it('should throw error when no document updated', async () => {
        const updates = { name: 'Updated Name' };
        mockCollection.findOneAndUpdate.mockResolvedValue(null);

        await expect(collection.updateFirst(updates)).rejects.toThrow('Failed to update entity');
      });
    });
  });

  describe('Atomic Operations', () => {
    describe('increment', () => {
      it('should increment field by default amount', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.increment('507f1f77bcf86cd799439010', 'loginCount');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { loginCount: 1 },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should increment field by custom amount', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.increment('507f1f77bcf86cd799439010', 'score', 10);

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { score: 10 },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should set updatedBy when clientId provided', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.increment('507f1f77bcf86cd799439010', 'loginCount', 1, 'client123');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { loginCount: 1 },
            $set: { updatedAt: expect.any(Number), updatedBy: 'client123' }
          }
        );
      });
    });

    describe('decrement', () => {
      it('should decrement field by default amount', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.decrement('507f1f77bcf86cd799439010', 'credits');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { credits: -1 },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should decrement field by custom amount', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.decrement('507f1f77bcf86cd799439010', 'credits', 5);

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { credits: -5 },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should set updatedBy when clientId provided', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.decrement('507f1f77bcf86cd799439010', 'credits', 1, 'client123');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $inc: { credits: -1 },
            $set: { updatedAt: expect.any(Number), updatedBy: 'client123' }
          }
        );
      });
    });

    describe('append', () => {
      it('should append items to array field', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.append('507f1f77bcf86cd799439010', 'tags', ['new-tag', 'another-tag']);

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $push: { tags: { $each: ['new-tag', 'another-tag'] } },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should set updatedBy when clientId provided', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.append('507f1f77bcf86cd799439010', 'tags', ['new-tag'], 'client123');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $push: { tags: { $each: ['new-tag'] } },
            $set: { updatedAt: expect.any(Number), updatedBy: 'client123' }
          }
        );
      });
    });

    describe('arrRemove', () => {
      it('should remove items from array field', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.arrRemove('507f1f77bcf86cd799439010', 'tags', ['old-tag']);

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $pull: { tags: { $in: ['old-tag'] } },
            $set: { updatedAt: expect.any(Number), updatedBy: undefined }
          }
        );
      });

      it('should set updatedBy when clientId provided', async () => {
        mockCollection.updateOne.mockResolvedValue({});

        await collection.arrRemove('507f1f77bcf86cd799439010', 'tags', ['old-tag'], 'client123');

        expect(mockCollection.updateOne).toHaveBeenCalledWith(
          { _id: expect.any(Object) },
          {
            $pull: { tags: { $in: ['old-tag'] } },
            $set: { updatedAt: expect.any(Number), updatedBy: 'client123' }
          }
        );
      });
    });
  });

  describe('Delete Operations', () => {
    describe('delete', () => {
      it('should delete document and log event', async () => {
        const userToDelete = sampleUsersWithIds[0];
        mockCollection.findOne.mockResolvedValue(userToDelete);
        mockCollection.deleteOne.mockResolvedValue({});
        mockCollection.countDocuments.mockResolvedValue(2);
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        await collection.delete('507f1f77bcf86cd799439010', 'client123');

        expect(mockCollection.deleteOne).toHaveBeenCalledWith({
          _id: expect.any(Object)
        });
        expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
          name: EventName.DeleteEntity,
          value: expect.objectContaining({
            id: '507f1f77bcf86cd799439010',
            collectionType: 'users',
            backup: userToDelete,
            deletedBy: 'client123'
          }),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
      });
    });

    describe('batchDelete', () => {
      it('should delete multiple documents and log event', async () => {
        const usersToDelete = sampleUsersWithIds.slice(0, 2);
        const ids = ['507f1f77bcf86cd799439010', '507f1f77bcf86cd799439011'];
        
        mockCollection.find().toArray.mockResolvedValue(usersToDelete);
        mockCollection.deleteMany.mockResolvedValue({});
        mockCollection.countDocuments.mockResolvedValue(1);
        mockEventsCollection.insertOne.mockResolvedValue({
          insertedId: 'event123'
        });

        await collection.batchDelete(ids, 'client123');

        expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
          name: EventName.BatchDeleteEntities,
          value: expect.objectContaining({
            collectionType: 'users',
            backup: usersToDelete,
            deletedBy: 'client123'
          }),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number)
        });
      });
    });
  });

  describe('Event Logging', () => {
    it('should log events when enabled', async () => {
      mockEventsCollection.insertOne.mockResolvedValue({
        insertedId: 'event123'
      });

      const result = await collection.logEvent({
        name: EventName.CreateEntity,
        value: { id: '123', collectionType: 'users', count: 1 }
      });

      expect(mockEventsCollection.insertOne).toHaveBeenCalledWith({
        name: EventName.CreateEntity,
        value: { id: '123', collectionType: 'users', count: 1 },
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number)
      });
      expect(result).toBe('event123');
    });

    it('should not log events when disabled', async () => {
      const collectionWithoutLogging = new FlongoCollection<TestUser>('users', {
        enableEventLogging: false
      });

      const result = await collectionWithoutLogging.logEvent({
        name: EventName.CreateEntity,
        value: { id: '123', collectionType: 'users', count: 1 }
      });

      expect(mockEventsCollection.insertOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});