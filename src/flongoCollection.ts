import { flongoDb } from "./flongo";
import { FlongoQuery } from "./flongoQuery";
import { Entity, Event, EventName, EventRecord, Pagination, Repository } from "./types";
import { Collection, Filter, FindOptions, ObjectId, OptionalUnlessRequiredId } from "mongodb";
import { Error404 } from "./errors";

/**
 * Configuration options for FlongoCollection instances
 */
export interface FlongoCollectionOptions {
  /** Whether to enable automatic event logging for CRUD operations */
  enableEventLogging?: boolean;
  /** Name of the collection to store events in (defaults to "events") */
  eventsCollectionName?: string;
}

/**
 * FlongoCollection provides a high-level interface for MongoDB collection operations
 * with automatic entity management, event logging, and fluent query support.
 *
 * This class abstracts MongoDB collection operations and provides:
 * - Automatic _id conversion between ObjectId and string
 * - Timestamps management (createdAt, updatedAt)
 * - Optional event logging for audit trails
 * - Integration with FlongoQuery for fluent querying
 * - Type-safe operations with TypeScript generics
 *
 * Example usage:
 * ```typescript
 * interface User {
 *   name: string;
 *   email: string;
 *   age: number;
 * }
 *
 * const users = new FlongoCollection<User>('users');
 *
 * // Create a user
 * const user = await users.create({ name: 'John', email: 'john@example.com', age: 30 });
 *
 * // Query users
 * const adults = await users.getAll(
 *   new FlongoQuery().where('age').gtEq(18)
 * );
 * ```
 */
export class FlongoCollection<T> {
  /** The underlying MongoDB collection */
  private collection: Collection<Entity & T>;

  /** Events collection for audit logging (null if logging disabled) */
  private events: Collection<EventRecord> | null;

  /** Collection name for event logging */
  private name: Repository;

  /** Configuration options */
  private options: FlongoCollectionOptions;

  /**
   * Creates a new FlongoCollection instance
   * @param collectionName - Name of the MongoDB collection
   * @param options - Configuration options for the collection
   */
  constructor(collectionName: Repository, options: FlongoCollectionOptions = {}) {
    this.collection = flongoDb.collection(collectionName);
    this.options = { enableEventLogging: true, eventsCollectionName: "events", ...options };

    // Initialize events collection only if logging is enabled
    this.events = this.options.enableEventLogging
      ? flongoDb.collection(this.options.eventsCollectionName!)
      : null;

    this.name = collectionName;
  }

  // ===========================================
  // READ OPERATIONS
  // ===========================================

  /**
   * Retrieves a single document by its ID
   * @param id - Document ID (string that will be converted to ObjectId)
   * @returns Promise resolving to the document with Entity metadata
   * @throws Error404 if document is not found
   */
  async get(id: string): Promise<Entity & T> {
    const objId = new ObjectId(id);
    const docWithId = await this.collection.findOne({ _id: objId } as any);

    if (docWithId) {
      return this.toEntity(docWithId);
    } else {
      console.error("Could not find id: " + id);
      throw new Error404();
    }
  }

  /**
   * Converts MongoDB document to Entity format
   * Converts ObjectId _id to string and ensures proper typing
   * @private
   * @param obj - Raw MongoDB document
   * @returns Document with string _id and Entity typing
   */
  private toEntity(obj?: any): Entity & T {
    return { ...obj, _id: String(obj._id) } as Entity & T;
  }

  /**
   * Retrieves multiple documents based on query and pagination
   * @param query - Optional FlongoQuery for filtering
   * @param pagination - Optional pagination settings
   * @returns Promise resolving to array of documents
   */
  async getAll(query?: FlongoQuery, pagination?: Pagination): Promise<(Entity & T)[]> {
    const mongodbQuery: Filter<Entity & T> = query?.build() ?? {};
    const mongodbOptions: FindOptions<Entity & T> = query?.buildOptions(pagination) ?? (new FlongoQuery()).buildOptions(pagination);

    try {
      const res = await this.collection.find(mongodbQuery, mongodbOptions).toArray();
      return res.map((d) => this.toEntity(d));
    } catch (err) {
      throw err;
    }
  }

  /**
   * Retrieves a subset of documents with required query and pagination
   * Similar to getAll but requires both query and pagination parameters
   * @param query - FlongoQuery for filtering (required)
   * @param pagination - Pagination settings (required)
   * @returns Promise resolving to array of documents
   */
  async getSome(query: FlongoQuery, pagination: Pagination): Promise<(Entity & T)[]> {
    const mongodbQuery: Filter<Entity & T> = query?.build();
    const mongodbOptions: FindOptions<Entity & T> = query?.buildOptions(pagination);

    return (await this.collection.find(mongodbQuery, mongodbOptions).toArray()).map((d) =>
      this.toEntity(d)
    );
  }

  /**
   * Retrieves the first document matching the query
   * @param query - FlongoQuery for filtering
   * @returns Promise resolving to the first matching document
   */
  async getFirst(query: FlongoQuery): Promise<Entity & T> {
    const mongodbQuery: Filter<Entity & T> = query?.build();
    const mongodbOptions: FindOptions<Entity & T> = query?.buildOptions();

    return this.toEntity(await this.collection.findOne(mongodbQuery, mongodbOptions));
  }

  /**
   * Counts documents matching the query
   * @param query - Optional FlongoQuery for filtering
   * @returns Promise resolving to the count of matching documents
   */
  async count(query?: FlongoQuery): Promise<number> {
    const mongodbQuery: Filter<Entity & T> = query?.build() ?? {};
    return this.collection.countDocuments(mongodbQuery);
  }

  /**
   * Checks if any documents match the query
   * @param query - FlongoQuery for filtering
   * @returns Promise resolving to true if any documents match, false otherwise
   */
  async exists(query: FlongoQuery): Promise<boolean> {
    try {
      const count = await this.collection.countDocuments(query.build());
      return count > 0;
    } catch (err) {
      return false;
    }
  }

  // ===========================================
  // DELETE OPERATIONS
  // ===========================================

  /**
   * Deletes a single document by ID
   * Logs the deletion event with backup data before deleting
   * @param id - Document ID to delete
   * @param clientId - ID of the client performing the deletion (for audit trail)
   */
  async delete(id: string, clientId: string): Promise<void> {
    // Get the entity before deletion for backup logging
    const entity = await this.get(id);

    // Log deletion event with backup data
    this.logEvent<EventName.DeleteEntity>({
      name: EventName.DeleteEntity,
      value: {
        id,
        collectionType: this.name,
        count: await this.count(),
        backup: entity,
        deletedBy: clientId
      }
    });

    // Perform the actual deletion
    await this.collection.deleteOne({ _id: new ObjectId(id) } as any);
  }

  /**
   * Deletes multiple documents by their IDs
   * Logs batch deletion event with backup data before deleting
   * @param ids - Array of document IDs to delete
   * @param clientId - ID of the client performing the deletion
   */
  async batchDelete(ids: string[], clientId: string): Promise<void> {
    // Note: There's a bug in the original code - mongodbQuery is incorrectly structured
    // It should use ObjectIds, but we'll preserve the original logic for now
    const mongodbQuery: Filter<Entity & T> = { _id: { $in: ids } } as any;

    // Get entities before deletion for backup logging
    const entities = await this.getAll(new FlongoQuery().where("_id").in(ids));

    // Log batch deletion event
    this.logEvent<EventName.BatchDeleteEntities>({
      name: EventName.BatchDeleteEntities,
      value: {
        collectionType: this.name,
        count: await this.count(),
        backup: entities,
        deletedBy: clientId
      }
    });

    // Perform the actual deletion
    // Note: This should be corrected to use proper MongoDB query structure
    await this.collection.deleteMany({ mongodbQuery });
  }

  // ===========================================
  // CREATE OPERATIONS
  // ===========================================

  /**
   * Creates a new document in the collection
   * Automatically adds timestamps and logs the creation event
   * @param attributes - Document data (without Entity metadata)
   * @param clientId - Optional client ID for audit trail
   * @returns Promise resolving to the created document with Entity metadata
   */
  async create(attributes: T, clientId?: string): Promise<Entity & T> {
    try {
      // Insert document with automatic timestamps
      const created = await this.collection.insertOne({
        ...attributes,
        createdAt: Date.now(),
        updatedAt: Date.now()
      } as OptionalUnlessRequiredId<Entity & T>);

      // Retrieve the created document to get the full entity
      const entity: Entity & T = this.toEntity(await this.get(created.insertedId));

      // Log creation event
      this.logEvent<EventName.CreateEntity>({
        name: EventName.CreateEntity,
        identity: clientId,
        value: { id: entity._id, collectionType: this.name, count: await this.count() }
      });

      return entity;
    } catch (err) {
      console.error("Failed create: ", err);
      throw err;
    }
  }

  /**
   * Creates multiple documents in a single batch operation
   * More efficient than individual creates for large datasets
   * @param attributes - Array of document data
   * @param clientId - Optional client ID for audit trail
   */
  async batchCreate(attributes: T[], clientId?: string): Promise<void> {
    if (attributes.length === 0) return;

    const now = Date.now();

    // Prepare entities with timestamps
    const entities = attributes.map(
      (attribute) =>
        ({
          ...attribute,
          createdAt: now,
          updatedAt: now
        } as OptionalUnlessRequiredId<Entity & T>)
    );

    // Insert all entities at once
    await this.collection.insertMany(entities);

    // Log batch creation event
    this.logEvent<EventName.BatchCreateEntities>({
      name: EventName.BatchCreateEntities,
      identity: clientId,
      value: { collectionType: this.name, count: await this.count() }
    });
  }

  // ===========================================
  // UPDATE OPERATIONS
  // ===========================================

  /**
   * Updates multiple documents matching the query
   * @param attributes - Fields to update
   * @param query - Optional FlongoQuery to filter documents (updates all if not provided)
   * @param clientId - Optional client ID for audit trail
   */
  async updateAll(attributes: any, query?: FlongoQuery, clientId?: string): Promise<void> {
    const mongodbQuery: Filter<Entity & T> = query?.build() ?? {};

    // Perform the update with automatic updatedAt timestamp
    await this.collection.updateMany(mongodbQuery, {
      $set: {
        updatedAt: Date.now(),
        ...attributes
      }
    });

    // Log batch update event
    this.logEvent<EventName.BatchUpdateEntities>({
      name: EventName.BatchUpdateEntities,
      identity: clientId,
      value: { collectionType: this.name }
    });
  }

  /**
   * Updates a single document by ID
   * @param id - Document ID to update
   * @param attributes - Fields to update
   * @param clientId - Optional client ID for audit trail
   */
  async update(id: string, attributes: any, clientId?: string): Promise<void> {
    // Prevent _id from being updated (safety measure)
    if ("_id" in attributes) {
      delete attributes._id;
    }

    try {
      // Perform the update with automatic updatedAt timestamp
      await this.collection.updateOne({ _id: new ObjectId(id) } as any, {
        $set: {
          updatedAt: Date.now(),
          ...attributes
        }
      });

      // Log update event
      this.logEvent<EventName.UpdateEntity>({
        name: EventName.UpdateEntity,
        identity: clientId,
        value: { collectionType: this.name, id }
      });
    } catch (err) {
      console.error("Failed updating: ", err);
      throw err;
    }
  }

  /**
   * Updates the first document matching the query
   * @param attributes - Fields to update
   * @param query - Optional FlongoQuery to filter documents
   * @param clientId - Optional client ID for audit trail
   * @returns Promise resolving to the updated document
   */
  async updateFirst(attributes: any, query?: FlongoQuery, clientId?: string): Promise<Entity & T> {
    const mongodbQuery: Filter<Entity & T> = query?.build() ?? {};

    const update = {
      $set: {
        updatedAt: Date.now(),
        ...attributes
      }
    };

    const updated = await this.collection.findOneAndUpdate(mongodbQuery, update);

    if (updated) {
      return this.toEntity(updated);
    } else {
      throw new Error("Failed to update entity");
    }
  }

  // ===========================================
  // ATOMIC OPERATIONS
  // ===========================================

  /**
   * Atomically increments a numeric field
   * @param id - Document ID
   * @param key - Field name to increment
   * @param amt - Amount to increment by (defaults to 1)
   */
  async increment(id: string, key: string, amt?: number): Promise<void> {
    const inc: any = { $inc: { [key]: amt || 1 } };
    await this.collection.updateOne({ _id: new ObjectId(id) } as any, inc);
  }

  /**
   * Atomically decrements a numeric field
   * @param id - Document ID
   * @param key - Field name to decrement
   * @param amt - Amount to decrement by (defaults to 1)
   */
  async decrement(id: string, key: string, amt?: number): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $inc: { [key]: -(amt ?? 1) } } as any
    );
  }

  /**
   * Atomically appends items to an array field
   * @param id - Document ID
   * @param key - Array field name
   * @param items - Items to append to the array
   */
  async append(id: string, key: string, items: any[]): Promise<void> {
    await this.collection.updateOne({ _id: new ObjectId(id) } as any, {
      $push: { [key]: { $each: items } } as any
    });
  }

  /**
   * Atomically removes items from an array field
   * @param id - Document ID
   * @param key - Array field name
   * @param items - Items to remove from the array
   */
  async arrRemove(id: string, key: string, items: any[]): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $pull: { [key]: { $in: items } } } as any
    );
  }

  // ===========================================
  // EVENT LOGGING
  // ===========================================

  /**
   * Logs an event to the events collection for audit trails
   * Events are only logged if event logging is enabled in options
   * @param event - Event object with name and metadata
   * @returns Promise resolving to the event ID (or null if logging disabled)
   */
  async logEvent<T extends EventName>(event: Event<T>): Promise<string | null> {
    if (!this.events) {
      return null; // Event logging is disabled
    }

    // Insert event with automatic timestamps
    const created = await this.events.insertOne({
      ...event,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as OptionalUnlessRequiredId<EventRecord<T>>);

    return String(created.insertedId);
  }
}
