# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Flongo codebase.

## Project Overview

**Flongo** is a TypeScript library that provides a Firestore-like fluent query API for MongoDB. It simplifies MongoDB operations by offering an intuitive, chainable interface similar to Firebase Firestore, while maintaining the power and flexibility of MongoDB underneath.

### Key Features
- **Fluent Query API**: Chainable methods for building complex MongoDB queries
- **Type Safety**: Full TypeScript support with generic types
- **Automatic Timestamps**: Built-in `createdAt` and `updatedAt` handling
- **Event Logging**: Optional audit trail for all database operations
- **ObjectId Handling**: Automatic conversion between strings and MongoDB ObjectIds
- **Geospatial Queries**: Support for location-based queries with geohash bounds
- **Range Queries**: Simplified syntax for numeric and date ranges
- **Array Operations**: Intuitive methods for array field queries

## Repository Structure

```
flongo/
├── src/
│   ├── flongo.ts              # Core initialization and database connection
│   ├── flongoQuery.ts         # Fluent query builder (main feature)
│   ├── flongoCollection.ts    # Collection operations wrapper
│   ├── types.ts               # Shared TypeScript definitions
│   ├── errors.ts              # Custom error classes
│   ├── index.ts               # Package exports
│   └── __tests__/             # Comprehensive test suite
│       ├── flongoQuery.test.ts      # Query builder tests
│       ├── flongoCollection.test.ts # Collection operations tests
│       ├── integration.test.ts      # End-to-end tests
│       ├── edgeCases.test.ts        # Edge cases and error scenarios
│       ├── errors.test.ts           # Error class tests
│       ├── index.test.ts            # Package exports tests
│       ├── setup.ts                 # Test configuration
│       └── testUtils.ts             # Test utilities and mocks
├── dist/                      # Compiled JavaScript output
├── package.json               # NPM package configuration
├── tsconfig.json             # TypeScript configuration
├── vitest.config.ts          # Test configuration
└── README.md                 # Project documentation
```

## Core Architecture

### FlongoQuery - The Heart of Flongo
The `FlongoQuery` class provides the fluent interface for building MongoDB queries:

```typescript
const query = new FlongoQuery()
  .where('age').gtEq(18)
  .and('status').eq('active')
  .and('tags').arrContainsAny(['developer', 'designer'])
  .orderBy('createdAt', SortDirection.Descending);
```

**Key Methods:**
- **Comparison**: `eq()`, `neq()`, `gt()`, `lt()`, `gtEq()`, `ltEq()`
- **Arrays**: `in()`, `notIn()`, `arrContainsAny()`, `arrContainsAll()`
- **Strings**: `startsWith()`, `endsWith()`, `strContains()`
- **Ranges**: `inRange(field, min, max)` - automatically merges $gte and $lte
- **Geospatial**: `geoWithin(bounds)`, `inRadius(center, radius)`
- **Logical**: `or(subQuery)`, `andQuery(subQuery)`

### FlongoCollection - CRUD Operations
Wraps MongoDB collections with additional features:

```typescript
const collection = new FlongoCollection<User>('users');
const user = await collection.create(userData, 'clientId');
const users = await collection.getAll(query, pagination);
```

**Features:**
- Automatic `createdAt`/`updatedAt` timestamps
- Event logging for audit trails
- Type-safe operations with generics
- Atomic operations: `increment()`, `decrement()`, `append()`, `arrRemove()`
- Batch operations: `batchCreate()`, `batchDelete()`, `updateAll()`

## Development Commands

### Setup
```bash
npm install        # Install dependencies
```

### Building
```bash
npm run build      # Compile TypeScript to JavaScript
npm run build:watch # Watch mode for development
```

### Testing
```bash
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Run specific test files
npx vitest src/__tests__/flongoQuery.test.ts --run
npx vitest src/__tests__/integration.test.ts --run
```

### Code Quality
```bash
npm run lint       # Run ESLint
npm run lint:fix   # Fix linting issues automatically
npm run typecheck  # TypeScript type checking
```

## Testing Strategy

The project has comprehensive test coverage across multiple dimensions:

### Test Files
- **Unit Tests**: `flongoQuery.test.ts`, `flongoCollection.test.ts`, `errors.test.ts`
- **Integration Tests**: `integration.test.ts` - Full workflow testing with mocked MongoDB
- **Edge Cases**: `edgeCases.test.ts` - Boundary conditions and error scenarios
- **Exports**: `index.test.ts` - Package API verification

### Test Setup
- **Framework**: Vitest for fast, modern testing
- **Mocking**: MongoDB operations mocked for reliable, fast tests
- **Coverage**: Comprehensive coverage of all public APIs
- **Type Safety**: Tests verify TypeScript types and compile-time safety

### Key Test Scenarios
- Query building with all operators
- Field merging for range queries (e.g., `$gte` and `$lte` on same field)
- Complex nested OR/AND logic
- Array and string operations
- ObjectId handling and conversion
- Error scenarios and edge cases
- Event logging and timestamps
- Pagination and sorting

## Key Implementation Details

### Query Building Logic
The `build()` method in FlongoQuery converts the fluent interface to MongoDB filter objects:
- **Field Merging**: Multiple operators on the same field are merged (crucial for range queries)
- **Value Filtering**: Only `null` and `undefined` values are filtered out; `0`, `false`, and `''` are preserved
- **ObjectId Conversion**: Automatic string-to-ObjectId conversion for `_id` fields
- **Nested Queries**: Proper handling of OR/AND sub-queries

### Event Logging System
Optional audit trail that logs all database operations:
- **Event Types**: Create, Update, Delete operations
- **Configurable**: Can be disabled per collection
- **Non-blocking**: Event logging failures don't affect main operations
- **Rich Context**: Includes operation details, timestamps, and client identification

### Type Safety Features
- **Generic Collections**: `FlongoCollection<T>` ensures type safety
- **Entity Interface**: Automatic `_id`, `createdAt`, `updatedAt` fields
- **Query Type Inference**: Methods return properly typed results
- **MongoDB Compatibility**: Uses official MongoDB driver types

## Development Guidelines

### When Adding New Features
1. **Start with Tests**: Write tests first to define expected behavior
2. **Update Types**: Ensure TypeScript definitions are complete
3. **Document APIs**: Add comprehensive JSDoc comments
4. **Test Edge Cases**: Consider null/undefined values, empty arrays, invalid inputs
5. **Maintain Compatibility**: Preserve existing API contracts

### Common Patterns
- **Fluent Interface**: All query methods return `this` for chaining
- **Defensive Programming**: Handle null/undefined gracefully
- **MongoDB Idioms**: Use MongoDB operators and patterns correctly
- **Error Handling**: Provide clear, actionable error messages

### Performance Considerations
- **Query Optimization**: Build efficient MongoDB queries
- **Lazy Evaluation**: Queries are built only when executed
- **Minimal Overhead**: Thin wrapper over MongoDB driver
- **Memory Efficiency**: Avoid unnecessary object creation

## Dependencies

### Runtime Dependencies
- **mongodb**: Official MongoDB Node.js driver
- **geofire-common**: Geospatial query utilities for geohash operations

### Development Dependencies
- **typescript**: Type checking and compilation
- **vitest**: Modern testing framework
- **@types/\***: TypeScript type definitions
- **eslint**: Code linting and style enforcement

## Publishing Notes

When ready to publish to npm:
1. Ensure all tests pass: `npm test`
2. Build the package: `npm run build`
3. Update version in `package.json`
4. Update `README.md` with usage examples
5. Publish: `npm publish`

## Future Enhancements

Potential areas for expansion:
- **Aggregation Pipeline**: Fluent interface for MongoDB aggregation
- **Schema Validation**: Runtime type checking and validation
- **Connection Pooling**: Advanced connection management
- **Caching Layer**: Optional query result caching
- **Migration Tools**: Database schema evolution utilities
- **Performance Monitoring**: Query performance metrics and optimization suggestions

## Troubleshooting

### Common Issues
- **Module Import Errors**: Ensure proper TypeScript configuration
- **MongoDB Connection**: Verify connection string and database accessibility
- **Test Failures**: Check MongoDB driver version compatibility
- **Type Errors**: Ensure generic types are properly specified

### Debug Commands
```bash
# Run tests with debug output
npx vitest --reporter=verbose

# Type check without emitting
npx tsc --noEmit

# Check built JavaScript output
node -e "console.log(require('./dist/index.js'))"
```

This project represents a modern, type-safe approach to MongoDB operations in Node.js, combining the best of both Firestore's developer experience and MongoDB's powerful query capabilities.