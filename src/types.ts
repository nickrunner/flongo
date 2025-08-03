// Core types for flongo - extracted from @staysco/models

export interface Entity {
  _id: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}

export type DbRecord<T> = Entity & T;

export interface Pagination {
  offset: number;
  count: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  geohash?: string;
  geoJSON?: GeoJson;
}

export interface GeoJson {
  type: string;
  coordinates: number[];
}

export interface Bounds {
  ne: Coordinates;
  sw: Coordinates;
  center?: Coordinates;
}

// Event system types - making these generic for flongo
export enum EventName {
  CreateEntity = "create_entity",
  BatchCreateEntities = "batch_create_entities",
  UpdateEntity = "update_entity",
  BatchUpdateEntities = "batch_update_entities",
  DeleteEntity = "delete_entity",
  BatchDeleteEntities = "batch_delete_entities"
}

export type Event<T> = {
  name: T;
  identity?: string;
  value?: any; // Generic value for now
};

export type EventRecord<T extends EventName = any> = DbRecord<Event<T>>;

// Enums for common operations
export enum Logic {
  and = "and",
  or = "or"
}

export enum SortDirection {
  Ascending = "asc",
  Descending = "desc"
}

// Collection operations
export class ColRange {
  public key = "";
  public start = "";
  public end = "";
}

export class ColExpression {
  public op? = "==";
  public key = "";
  public val: any = "";

  public constructor(key: string) {
    if (this.key === "_id") {
      this.key = String(key);
    } else {
      this.key = key;
    }
  }
}

// Interfaces for query and collection operations
export type ICollectionQuery = {
  expressions: ColExpression[];
  ranges: ColRange[];
  orderField?: string;
  orderDirection?: SortDirection;
  orQueries: ICollectionQuery[];
  andQueries: ICollectionQuery[];
};

export type ICollection<T> = {
  getAll: (query?: ICollectionQuery, pagination?: Pagination) => Promise<(Entity & T)[]>;
  getSome: (query: ICollectionQuery, pagination: Pagination) => Promise<(Entity & T)[]>;
  getFirst: (query: ICollectionQuery, pagination?: Pagination) => Promise<Entity & T>;
  get: (id: string) => Promise<Entity & T>;
  count: (query?: ICollectionQuery) => Promise<number>;
  delete: (id: string, clientId?: string) => Promise<void>;
  batchDelete: (ids: string[], clientId?: string) => Promise<void>;
  exists: (query: ICollectionQuery) => Promise<boolean>;
  create: (attributes: T, clientId?: string) => Promise<Entity & T>;
  batchCreate: (attributes: T[], clientId?: string) => Promise<void>;
  updateAll: (attributes: any, filters?: any, clientId?: string) => Promise<void>;
  update: (id: string, attributes: any, clientId?: string) => Promise<void>;
  increment: (id: string, key: string, amt?: number) => Promise<void>;
  decrement: (id: string, key: string, amt?: number) => Promise<void>;
  append: (id: string, key: string, items: any[]) => Promise<void>;
  arrRemove: (id: string, key: string, items: any[]) => Promise<void>;
  updateFirst: (attributes: any, filters?: any, clientId?: string) => Promise<Entity & T>;
};

// Repository type - making it generic for flongo
export type Repository = string;
