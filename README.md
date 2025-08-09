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

### Caching with CachedFlongoCollection

CachedFlongoCollection provides transparent read-through caching for all read operations, significantly improving performance for frequently accessed data.

```typescript
import { CachedFlongoCollection, MemoryCache } from 'flongo';

// Create a cached collection with default settings
const users = new CachedFlongoCollection<User>('users', {
  cache: {
    enabled: true
  }
});

// Custom cache configuration
const products = new CachedFlongoCollection<Product>('products', {
  cache: {
    enabled: true,
    store: new MemoryCache({
      maxEntries: 10000,
      defaultTTL: 3600 // 1 hour
    }),
    // Warmup frequently accessed data on startup
    warmup: [
      { query: new FlongoQuery().where('featured').eq(true) },
      { query: new FlongoQuery().where('category').eq('bestsellers') }
    ],
    // Bypass cache for sensitive queries
    bypassPatterns: [
      (query) => query?.expressions.some(e => e.key === 'userId')
    ]
  }
});

// All read operations are automatically cached
const user = await users.get('user123'); // First call hits DB
const user2 = await users.get('user123'); // Second call uses cache

// Cache is automatically invalidated on writes
await users.update('user123', { name: 'Updated Name' });
const user3 = await users.get('user123'); // Cache refreshed from DB

// Manual cache management
await users.clearCache(); // Clear all cached entries
await users.invalidateCache('*:getAll:*'); // Selective invalidation
const stats = await users.getCacheStats(); // Monitor cache performance
```

#### Key Features of CachedFlongoCollection

- **Drop-in replacement**: Fully compatible with FlongoCollection API
- **Automatic caching**: All read operations (get, getAll, getSome, getFirst, count, exists) are cached
- **Smart invalidation**: Cache is automatically invalidated on write operations
- **Query normalization**: Consistent cache keys regardless of query parameter order
- **Cache warmup**: Pre-load frequently accessed data on initialization
- **Bypass patterns**: Skip caching for specific query patterns (e.g., user-specific data)
- **Performance monitoring**: Built-in statistics for cache hits, misses, and evictions
- **Configurable TTL**: Set different expiration times per operation type
- **Memory management**: Automatic eviction when cache size limits are reached

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