import { describe, it, expect, beforeEach } from 'vitest';
import { FlongoQuery, FlongoQueryBuilder } from '../flongoQuery';
import { SortDirection, Logic } from '../types';

describe('FlongoQuery', () => {
  let query: FlongoQuery;

  beforeEach(() => {
    query = new FlongoQuery();
  });

  describe('Basic Query Building', () => {
    it('should create an empty query by default', () => {
      const built = query.build();
      expect(built).toEqual({});
    });

    it('should handle simple where clause', () => {
      const built = query.where('name').eq('John').build();
      expect(built).toEqual({
        name: { $eq: 'John' }
      });
    });

    it('should handle multiple where clauses with AND logic', () => {
      const built = query
        .where('name').eq('John')
        .and('age').gt(25)
        .build();
      
      expect(built).toEqual({
        name: { $eq: 'John' },
        age: { $gt: 25 }
      });
    });
  });

  describe('Comparison Operators', () => {
    it('should handle equality', () => {
      const built = query.where('status').eq('active').build();
      expect(built).toEqual({
        status: { $eq: 'active' }
      });
    });

    it('should handle not equal', () => {
      const built = query.where('status').neq('deleted').build();
      expect(built).toEqual({
        status: { $ne: 'deleted' }
      });
    });

    it('should handle less than', () => {
      const built = query.where('age').lt(30).build();
      expect(built).toEqual({
        age: { $lt: 30 }
      });
    });

    it('should handle less than or equal', () => {
      const built = query.where('age').ltEq(30).build();
      expect(built).toEqual({
        age: { $lte: 30 }
      });
    });

    it('should handle greater than', () => {
      const built = query.where('age').gt(18).build();
      expect(built).toEqual({
        age: { $gt: 18 }
      });
    });

    it('should handle greater than or equal', () => {
      const built = query.where('age').gtEq(18).build();
      expect(built).toEqual({
        age: { $gte: 18 }
      });
    });

    it('should remove expression when value is falsy', () => {
      const built = query.where('name').eq(null).build();
      expect(built).toEqual({});
    });
  });

  describe('Array Operators', () => {
    it('should handle array contains', () => {
      const built = query.where('tags').arrContains('developer').build();
      expect(built).toEqual({
        tags: 'developer'
      });
    });

    it('should handle array contains all', () => {
      const built = query.where('skills').arrContainsAll(['js', 'ts']).build();
      expect(built).toEqual({
        skills: { $all: ['js', 'ts'] }
      });
    });

    it('should handle array contains any', () => {
      const built = query.where('tags').arrContainsAny(['developer', 'designer']).build();
      expect(built).toEqual({
        tags: { $in: ['developer', 'designer'] }
      });
    });

    it('should remove expression when arrContainsAny gets empty array', () => {
      const built = query.where('tags').arrContainsAny([]).build();
      expect(built).toEqual({});
    });

    it('should handle in operator', () => {
      const built = query.where('id').in(['1', '2', '3']).build();
      expect(built).toEqual({
        id: { $in: ['1', '2', '3'] }
      });
    });

    it('should handle not in operator', () => {
      const built = query.where('status').notIn(['deleted', 'banned']).build();
      expect(built).toEqual({
        status: { $nin: ['deleted', 'banned'] }
      });
    });

    it('should ignore notIn with empty array', () => {
      const built = query.where('status').notIn([]).build();
      expect(built).toEqual({});
    });
  });

  describe('String Operators', () => {
    it('should handle starts with', () => {
      const built = query.where('name').startsWith('John').build();
      expect(built).toEqual({
        name: { $regex: '^John', $options: 'i' }
      });
    });

    it('should handle ends with', () => {
      const built = query.where('email').endsWith('@gmail.com').build();
      expect(built).toEqual({
        email: { $regex: '@gmail.com$', $options: 'i' }
      });
    });

    it('should handle string contains', () => {
      const built = query.where('description').strContains('developer').build();
      expect(built).toEqual({
        description: { $regex: 'developer', $options: 'i' }
      });
    });
  });

  describe('Range Queries', () => {
    it('should handle inRange helper', () => {
      const built = query.inRange('age', 18, 65).build();
      expect(built).toEqual({
        age: { $gte: 18, $lte: 65 }
      });
    });
  });

  describe('Geospatial Queries', () => {
    it('should handle geoWithin', () => {
      const bounds = {
        ne: { latitude: 40.7829, longitude: -73.9441 },
        sw: { latitude: 40.7489, longitude: -73.9841 }
      };
      
      const built = query.where('location').geoWithin(bounds).build();
      
      expect(built).toEqual({
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: [[
                [-73.9441, 40.7829],
                [-73.9441, 40.7489],
                [-73.9841, 40.7489],
                [-73.9841, 40.7829],
                [-73.9441, 40.7829]
              ]]
            }
          }
        }
      });
    });

    it('should remove expression when geoWithin gets no bounds', () => {
      const built = query.where('location').geoWithin().build();
      expect(built).toEqual({});
    });

    it('should handle inRadius with geohash bounds', () => {
      const center = { latitude: 40.7589, longitude: -73.9851 };
      const radius = 1000;
      
      const builtQuery = query.inRadius('geohash', center, radius);
      
      // Should have OR queries for geohash bounds
      expect(builtQuery.orQueries.length).toBeGreaterThan(0);
      expect(builtQuery.orderField).toBe('geohash');
      expect(builtQuery.orderDirection).toBe(SortDirection.Ascending);
    });
  });

  describe('ObjectId Handling', () => {
    it('should handle single _id query', () => {
      const built = query.where('_id').eq('507f1f77bcf86cd799439011').build();
      expect(built._id.toString()).toBe('507f1f77bcf86cd799439011');
    });

    it('should handle multiple _id query', () => {
      const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
      const built = query.where('_id').in(ids).build();
      
      expect(built._id.$in).toHaveLength(2);
      expect(built._id.$in[0].toString()).toBe(ids[0]);
      expect(built._id.$in[1].toString()).toBe(ids[1]);
    });
  });

  describe('Logical Operators', () => {
    it('should handle OR queries', () => {
      const built = query
        .where('status').eq('active')
        .or(new FlongoQuery().where('featured').eq(true))
        .build();
      
      expect(built).toEqual({
        status: { $eq: 'active' },
        $or: [
          { featured: { $eq: true } }
        ]
      });
    });

    it('should handle multiple OR queries', () => {
      const built = query
        .where('status').eq('active')
        .or(new FlongoQuery().where('featured').eq(true))
        .or(new FlongoQuery().where('priority').eq('high'))
        .build();
      
      expect(built.$or).toHaveLength(2);
    });

    it('should handle AND queries', () => {
      const subQuery = new FlongoQuery().where('verified').eq(true);
      const built = query
        .where('status').eq('active')
        .andQuery(subQuery)
        .build();
      
      expect(built).toEqual({
        status: { $eq: 'active' },
        $and: [
          { verified: { $eq: true } }
        ]
      });
    });

    it('should add AND query and return this for chaining', () => {
      const emptyQuery = new FlongoQuery();
      const subQuery = new FlongoQuery().where('verified').eq(true);
      
      const result = emptyQuery.andQuery(subQuery);
      const built = emptyQuery.build();
      
      expect(result).toBe(emptyQuery); // Returns this query for chaining
      expect(built).toEqual({
        $and: [{ verified: { $eq: true } }]
      }); // AND query is added even to empty query
    });
  });

  describe('Sorting', () => {
    it('should handle orderBy', () => {
      query.orderBy('createdAt', SortDirection.Descending);
      
      expect(query.orderField).toBe('createdAt');
      expect(query.orderDirection).toBe(SortDirection.Descending);
    });

    it('should build sort options', () => {
      query.orderBy('name', SortDirection.Ascending);
      const options = query.buildOptions();
      
      expect(options.sort).toEqual({
        name: 1
      });
    });

    it('should build descending sort options', () => {
      query.orderBy('createdAt', SortDirection.Descending);
      const options = query.buildOptions();
      
      expect(options.sort).toEqual({
        createdAt: -1
      });
    });
  });

  describe('Pagination', () => {
    it('should build pagination options', () => {
      const pagination = { offset: 10, count: 20 };
      const options = query.buildOptions(pagination);
      
      expect(options.skip).toBe(10);
      expect(options.limit).toBe(20);
    });

    it('should combine sorting and pagination', () => {
      query.orderBy('name', SortDirection.Ascending);
      const pagination = { offset: 5, count: 15 };
      const options = query.buildOptions(pagination);
      
      expect(options).toEqual({
        skip: 5,
        limit: 15,
        sort: { name: 1 }
      });
    });
  });

  describe('Complex Queries', () => {
    it('should handle complex multi-field query', () => {
      const built = query
        .where('age').gtEq(18)
        .and('age').lt(65)
        .and('status').eq('active')
        .and('tags').arrContainsAny(['developer', 'designer'])
        .and('name').startsWith('J')
        .build();
      
      expect(built).toEqual({
        age: { $gte: 18, $lt: 65 },
        status: { $eq: 'active' },
        tags: { $in: ['developer', 'designer'] },
        name: { $regex: '^J', $options: 'i' }
      });
    });

    it('should handle query with OR and AND logic', () => {
      const built = query
        .where('status').eq('active')
        .or(
          new FlongoQuery()
            .where('featured').eq(true)
            .and('priority').eq('high')
        )
        .andQuery(
          new FlongoQuery().where('verified').eq(true)
        )
        .build();
      
      expect(built).toHaveProperty('status');
      expect(built).toHaveProperty('$or');
      expect(built).toHaveProperty('$and');
    });
  });

  describe('Error Handling', () => {
    it('should handle build errors gracefully', () => {
      // Force an error by mocking expressions to throw
      const mockQuery = new FlongoQuery();
      mockQuery.expressions = null as any;
      
      expect(() => mockQuery.build()).not.toThrow();
    });
  });

  describe('Method Chaining', () => {
    it('should return query instance for chaining', () => {
      const result = query
        .where('name')
        .eq('John')
        .and('age')
        .gt(18);
      
      expect(result).toBe(query);
      expect(result.expressions).toHaveLength(2);
    });

    it('should support fluent interface pattern', () => {
      const built = new FlongoQuery()
        .where('status').eq('active')
        .and('verified').eq(true)
        .and('age').gtEq(18)
        .orderBy('createdAt', SortDirection.Descending)
        .build();
      
      expect(built).toEqual({
        status: { $eq: 'active' },
        verified: { $eq: true },
        age: { $gte: 18 }
      });
    });
  });
});

describe('FlongoQueryBuilder', () => {
  it('should create a query builder with query instance', () => {
    const builder = new FlongoQueryBuilder();
    
    expect(builder.q).toBeInstanceOf(FlongoQuery);
    expect(builder.q.expressions).toEqual([]);
  });

  it('should allow building complex queries through builder', () => {
    const builder = new FlongoQueryBuilder();
    
    builder.q
      .where('status').eq('active')
      .and('age').gtEq(21);
    
    const built = builder.q.build();
    
    expect(built).toEqual({
      status: { $eq: 'active' },
      age: { $gte: 21 }
    });
  });
});