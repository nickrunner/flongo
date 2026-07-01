# Flongo 🔥🍃

**Firestore-like fluent query API for MongoDB**

Flongo brings the intuitive, chainable query syntax of Firestore to MongoDB, making database operations more readable and developer-friendly.

## Installation

```bash
npm install flongo
```

## Quick Start

```typescript
import { initializeFlongo, FlongoCollection, FlongoQuery } from 'flongo';

// Initialize MongoDB connection
initializeFlongo({
  connectionString: 'mongodb://localhost:27017',
  dbName: 'myapp'
});

// Define your data interface
interface User {
  name: string;
  email: string;
  age: number;
  tags: string[];
}

// Create a collection
const users = new FlongoCollection<User>('users');

// Query with fluent API
const adults = await users.getAll(
  new FlongoQuery()
    .where('age').gtEq(18)
    .and('tags').arrContainsAny(['developer', 'designer'])
    .orderBy('name')
);
```

## Features

- 🔗 **Chainable queries** - Firestore-like fluent API
- 🚀 **TypeScript support** - Full type safety and IntelliSense
- 📊 **Rich query operations** - Comparisons, arrays, geospatial, text search
- 🎛️ **Configurable** - Optional event logging, custom error handling
- 🗂️ **Declarative indexes** - Declare once, ensure idempotently on every boot
- 🧪 **Battle-tested** - Extracted from production codebase
- 📦 **Zero config** - Works with existing MongoDB setup

## API Reference

### Basic Queries

```typescript
const query = new FlongoQuery();

// Equality
query.where('status').eq('active')

// Comparisons
query.where('age').gt(21).and('age').lt(65)
query.where('score').gtEq(80).and('score').ltEq(100)
query.where('status').neq('deleted')

// Arrays
query.where('tags').arrContains('featured')
query.where('categories').arrContainsAny(['tech', 'design'])
query.where('skills').arrContainsAll(['js', 'react'])
query.where('id').in(['user1', 'user2', 'user3'])
query.where('role').notIn(['admin', 'banned'])

// Text search
query.where('name').startsWith('John')
query.where('email').endsWith('@gmail.com')
query.where('bio').strContains('developer')

// Ranges
query.inRange('price', 100, 500)
```

### Advanced Queries

```typescript
// OR queries
const activeOrFeatured = new FlongoQuery()
  .where('status').eq('active')
  .or(
    new FlongoQuery().where('featured').eq(true)
  );

// Geospatial queries
query.where('location').geoWithin({
  ne: { latitude: 40.7829, longitude: -73.9441 },
  sw: { latitude: 40.7489, longitude: -73.9441 }
});

// Radius search
query.inRadius('location', { latitude: 40.7589, longitude: -73.9851 }, 1000);

// Sorting and pagination
const results = await collection.getAll(
  query.orderBy('createdAt', SortDirection.Descending),
  { offset: 0, count: 20 }
);

// Compound (multi-field) sort with a unique tiebreaker.
// Appending `_id` makes skip/limit pagination deterministic, so pages never
// overlap or skip documents when the primary sort key has ties.
const page = await collection.getAll(
  new FlongoQuery()
    .where('status').eq('accepted')
    .orderBy('featured', SortDirection.Descending)
    .thenBy('_id', SortDirection.Ascending), // => sort: { featured: -1, _id: 1 }
  { offset: 0, count: 24 }
);
```

#### Seeded random sort (`orderByRandom`)

`orderByRandom(seed)` adds a **deterministic, seeded shuffle** for fair, rotating
list/browse orderings (e.g. a public directory with no meaningful ranking yet).
Given the same seed it produces the **same order on every call**, so `$skip`/`$limit`
pagination stays gapless and non-overlapping across pages; change the seed and the
whole set reshuffles.

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;
// Caller owns the rotation policy. Here: a new shuffle each day. Pin the seed for
// a browsing session (capture on first load, echo back per page) so paging is stable
// and rotation only affects new sessions.
const seed = sessionSeed ?? Math.floor(Date.now() / DAY_MS);

const query = new FlongoQuery()
  .where('enable').eq(true)
  .orderBy('featured', SortDirection.Descending) // pinned groups stay on top
  .orderByRandom(seed);                          // shuffle within each featured tier

const page = await stays.getAll(query, { offset: 0, count: 24 }); // stable, fair
```

- **Composable** with `orderBy`/`thenBy`: sort keys apply in call order and the
  shuffle slots in at *its* call position. `_id` is always appended as a final
  tiebreaker, so pages are gapless even under hash collisions.
- **Seed is caller-owned** — Flongo does not decide rotation cadence. Pass a
  time-bucketed seed for rotation, optionally mixed with a session/user id. Number
  and string seeds are normalized to a string, so `1` and `'1'` are equivalent.
- **Execution**: a query carrying `orderByRandom` runs via an aggregation pipeline
  (using `$toHashedIndexKey`) instead of `find` — the `getAll`/`getSome` signatures
  and return types are unchanged. **Requires MongoDB server ≥ 8.0**; on older
  servers `orderByRandom` fails fast with an actionable error.

#### Raw aggregation escape hatch

For computed-field sorts/rankings the fluent builder doesn't cover yet,
`FlongoCollection.aggregate(pipeline)` runs a raw MongoDB aggregation pipeline and
returns documents in Entity form (`_id` normalized to a string):

```typescript
const topRated = await products.aggregate([
  { $match: { inStock: true } },
  { $addFields: { score: { $multiply: ['$rating', '$reviewCount'] } } },
  { $sort: { score: -1 } },
  { $limit: 10 }
]);
```

### Collection Operations

```typescript
const collection = new FlongoCollection<User>('users');

// Create
const user = await collection.create({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  tags: ['developer']
});

// Read
const user = await collection.get('user123');
const users = await collection.getAll(query);
const first = await collection.getFirst(query);
const count = await collection.count(query);
const exists = await collection.exists(query);

// Update
await collection.update('user123', { age: 31 });
await collection.updateAll({ status: 'verified' }, query);
await collection.increment('user123', 'loginCount', 1);
await collection.append('user123', 'tags', ['admin']);

// Delete
await collection.delete('user123');
await collection.batchDelete(['user1', 'user2']);

// Batch operations
await collection.batchCreate([user1, user2, user3]);
```

### Configuration

```typescript
// Audit logging is OFF by default — opt in per collection
const collection = new FlongoCollection<User>('users', {
  enableEventLogging: true
});

// Opt in with a custom events collection
const collection = new FlongoCollection<User>('users', {
  enableEventLogging: true,
  eventsCollectionName: 'audit_logs'
});
```

#### Audit logging vs. your own `events` collection

Flongo's built-in audit trail is **opt-in** (`enableEventLogging` defaults to
`false`). When enabled, it writes to a collection named `events` by default. If
your application has its own `events` (analytics) collection, redirect Flongo's
audit trail to a dedicated collection so the two can be indexed and retained
independently:

```typescript
const users = new FlongoCollection<User>('users', {
  enableEventLogging: true,
  eventsCollectionName: 'audit_events'   // keep audit separate from app analytics
});
```

Both `eventsCollectionName` and `enableEventLogging` are per-collection, so you
control audit behavior for each collection independently.

## Index Management

Declare your indexes once in a central registry and Flongo will ensure them
**idempotently on every boot**. This keeps indexes colocated, version-controlled,
and out of ad-hoc scripts against the raw driver. Index management is **purely
additive** — with no `indexes` registry declared, boot behavior is identical to
previous versions.

### Declaring indexes

Register indexes at initialization, keyed by collection name. A single central
registry is the source of truth (rather than per-`FlongoCollection`-construction
specs), since one physical collection is often constructed in many places.

```typescript
import { connectFlongo, syncFlongoIndexes } from 'flongo';

await connectFlongo({
  connectionString: process.env.MONGO_URL!,
  dbName: 'stays',
  indexes: {
    events: [
      // Compound analytics indexes (order matters — ESR: equality, sort, range)
      { keys: { name: 1, 'value.stayId': 1, createdAt: 1 } },
      { keys: { name: 1, identity: 1, createdAt: 1 } }
    ],
    users: [
      { keys: { email: 1 }, options: { unique: true } }
    ],
    stays: [
      { keys: { shortlink: 1 }, options: { unique: true, sparse: true } },
      { keys: { 'location.coordinates.geoJSON': '2dsphere' } }
    ]
  },
  indexSync: { mode: 'ensure', onError: 'warn', background: false }
});
```

`connectFlongo` ensures the declared indexes after connecting. You can also run
the sync explicitly at any time (e.g. to gate boot on it, or from a migration /
CI job):

```typescript
const report = await syncFlongoIndexes();   // idempotent; returns FlongoIndexReport[]
```

### Index spec

```typescript
interface FlongoIndexSpec {
  keys: Record<string, 1 | -1 | '2dsphere' | 'text' | 'hashed'>;
  options?: {
    name?: string;                       // custom index name
    unique?: boolean;
    sparse?: boolean;
    partialFilterExpression?: Document;  // partial index (e.g. unique-when-present)
    expireAfterSeconds?: number;         // TTL — see caveat below
    collation?: CollationOptions;
    hidden?: boolean;                    // hide from the planner without dropping
  };
}
```

### Sync semantics

`syncFlongoIndexes()` calls `createIndex(keys, options)` per spec and returns a
structured report:

```typescript
interface FlongoIndexReport {
  collection: string;
  name: string;                                                   // resolved name
  status: 'created' | 'exists' | 'conflict' | 'failed' | 'pruned' | 'reconciled';
  error?: string;
}
```

- **Identical** spec already present → `"exists"` (no-op).
- **Same keys, different options** → MongoDB throws `IndexOptionsConflict`;
  Flongo records `"conflict"` and honors `onError` (it never silently
  drops/recreates). With the `reconcile` opt-in, the existing index is instead
  dropped and rebuilt from the declared spec → `"reconciled"` (see below).
- **Creation error** (classic case: a `unique` index over a collection that
  already contains duplicates) → `"failed"` with a message naming the likely
  cause. By default this does **not** crash the process.

#### `indexSync` options

| Option        | Values                          | Default    | Behavior |
|---------------|---------------------------------|------------|----------|
| `mode`        | `'ensure'` \| `'off'` \| `'strict'` | `'ensure'` | `ensure`: create missing, tolerate problems per `onError`. `off`: register specs but do nothing at boot (call `syncFlongoIndexes()` yourself). `strict`: throw on any conflict/failure (for CI / migration gates). |
| `onError`     | `'warn'` \| `'throw'`           | `'warn'`   | How non-fatal problems are surfaced. `strict` mode always throws. |
| `background`  | `boolean`                       | `false`    | When `true`, boot does not block on index builds — the sync runs asynchronously and logs its outcome. `await syncFlongoIndexes()` remains available when you want to await. |
| `prune`       | `boolean`                       | `false`    | Drop indexes present in Mongo but absent from the registry. See below. |
| `reconcile`   | `boolean`                       | `false`    | Drop + rebuild conflicting indexes from their declared specs. See below. |
| `dryRun`      | `boolean`                       | `false`    | With `prune`/`reconcile`, log what *would* be dropped (or dropped and rebuilt) without touching anything. |

### Non-destructive by default & pruning

Indexes present in Mongo but absent from the registry are **left untouched** by
default. Dropping is explicit opt-in and **never** touches the mandatory `_id_`
index:

```typescript
// Dry run first — logs out-of-registry indexes without dropping anything
await syncFlongoIndexes({ prune: true, dryRun: true });

// Then actually prune
const report = await syncFlongoIndexes({ prune: true });
```

### Reconciling option changes

Changing a declared index's **options** (e.g. adding `unique`, changing a
partial filter) makes MongoDB reject the `createIndex` with a conflict, since
an index's options are immutable. By default Flongo reports `"conflict"` and
leaves the resolution to you. With the `reconcile` opt-in, Flongo evolves the
index for you: it drops the existing index and rebuilds it from the declared
spec.

```typescript
// Dry run first — logs which indexes would be dropped and rebuilt
await syncFlongoIndexes({ reconcile: true, dryRun: true });

// Then actually reconcile
const report = await syncFlongoIndexes({ reconcile: true });
// → [{ collection: 'users', name: 'email_1', status: 'reconciled' }]
```

Safety properties:

- **Rollback on failure** — if the rebuild fails (e.g. you added `unique` and
  the collection contains duplicates), the original index is restored from the
  pre-sync snapshot and the report is `"failed"` with the cause. The collection
  is never left without the index.
- **Drops the real index** — the drop targets the server-side index that
  conflicts (matched by name, or by key pattern if your spec renames it), never
  a guessed name, and never `_id_`.

⚠️ **Rebuild window**: between the drop and the completed rebuild, queries
can't use the index and `unique` is not enforced. For large collections or
strict uniqueness requirements, prefer running reconcile during a maintenance
window rather than on every boot.

### Verifying indexes

Two passthroughs help confirm indexes are applied and used:

```typescript
const users = new FlongoCollection<User>('users');

await users.listIndexes();   // the collection's current index descriptions

// Confirm a query uses an index scan (IXSCAN) rather than a full scan (COLLSCAN)
const plan = await users.explain(new FlongoQuery().where('email').eq('a@b.com'));
```

### TTL caveat ⚠️

`expireAfterSeconds` (TTL) requires the indexed field to be a **BSON `Date`**.
Flongo stamps `createdAt` / `updatedAt` as epoch **numbers** (`Date.now()`), so a
TTL index on `createdAt` **will not expire anything**. To use TTL, index a
dedicated `Date`-typed field that you write yourself:

```typescript
await events.create({ ...data, expiresAt: new Date(Date.now() + 30 * 86400_000) });

// registry
events: [{ keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }]
```

## Examples

### E-commerce Product Search

```typescript
interface Product {
  name: string;
  price: number;
  category: string;
  tags: string[];
  inStock: boolean;
  rating: number;
}

const products = new FlongoCollection<Product>('products');

// Find affordable, well-rated tech products in stock
const results = await products.getAll(
  new FlongoQuery()
    .where('category').eq('electronics')
    .and('price').ltEq(500)
    .and('rating').gtEq(4.0)
    .and('inStock').eq(true)
    .and('tags').arrContainsAny(['laptop', 'phone', 'tablet'])
    .orderBy('rating', SortDirection.Descending)
);
```

### User Management

```typescript
interface User {
  email: string;
  role: string;
  lastLogin: number;
  preferences: string[];
  location?: Coordinates;
}

const users = new FlongoCollection<User>('users');

// Find active users who haven't logged in recently
const staleUsers = await users.getAll(
  new FlongoQuery()
    .where('role').neq('admin')
    .and('lastLogin').lt(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    .orderBy('lastLogin', SortDirection.Ascending)
);

// Find users interested in specific topics near a location
const nearbyDevs = await users.getAll(
  new FlongoQuery()
    .where('preferences').arrContainsAny(['javascript', 'react', 'node'])
    .and('location').inRadius(
      'location',
      { latitude: 37.7749, longitude: -122.4194 }, // San Francisco
      10000 // 10km radius
    )
);
```

## Error Handling

```typescript
import { Error404, Error400 } from 'flongo';

try {
  const user = await users.get('nonexistent-id');
} catch (error) {
  if (error instanceof Error404) {
    console.log('User not found');
  }
}
```

## Migration from Firestore

Flongo's API closely mirrors Firestore, making migration straightforward:

```typescript
// Firestore
const snapshot = await db.collection('users')
  .where('age', '>=', 18)
  .where('tags', 'array-contains-any', ['developer', 'designer'])
  .orderBy('name')
  .get();

// Flongo
const users = await collection.getAll(
  new FlongoQuery()
    .where('age').gtEq(18)
    .and('tags').arrContainsAny(['developer', 'designer'])
    .orderBy('name')
);
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.