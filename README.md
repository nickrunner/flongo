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
// Disable event logging
const collection = new FlongoCollection<User>('users', {
  enableEventLogging: false
});

// Custom events collection
const collection = new FlongoCollection<User>('users', {
  enableEventLogging: true,
  eventsCollectionName: 'audit_logs'
});
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