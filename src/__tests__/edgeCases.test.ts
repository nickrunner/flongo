import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlongoQuery } from '../flongoQuery';
import { FlongoCollection } from '../flongoCollection';
import { SortDirection } from '../types';
import { Error404 } from '../errors';

describe('Edge Cases and Error Scenarios', () => {
  describe('FlongoQuery Edge Cases', () => {
    let query: FlongoQuery;

    beforeEach(() => {
      query = new FlongoQuery();
    });

    it('should handle null and undefined values gracefully', () => {
      // Should remove expressions when values are null/undefined
      const built = query
        .where('field1').eq(null)
        .where('field2').eq(undefined)
        .where('field3').eq('')
        .where('field4').eq(0)
        .where('field5').eq(false)
        .build();

      // field3, field4, and field5 should remain (empty string, 0, and false are valid values)
      expect(Object.keys(built)).toHaveLength(3);
      expect(built.field3).toEqual({ $eq: '' });
      expect(built.field4).toEqual({ $eq: 0 });
      expect(built.field5).toEqual({ $eq: false });
    });

    it('should handle empty arrays in array operations', () => {
      const built = query
        .where('tags').arrContainsAny([])
        .where('categories').in([])
        .where('excludes').notIn([])
        .build();

      expect(built).toEqual({});
    });

    it('should handle complex nested OR/AND queries', () => {
      const complexQuery = query
        .where('status').eq('active')
        .or(
          new FlongoQuery()
            .where('priority').eq('high')
            .andQuery(
              new FlongoQuery().where('urgent').eq(true)
            )
        )
        .andQuery(
          new FlongoQuery()
            .where('verified').eq(true)
            .or(
              new FlongoQuery().where('trusted').eq(true)
            )
        );

      const built = complexQuery.build();

      expect(built).toHaveProperty('status');
      expect(built).toHaveProperty('$or');
      expect(built).toHaveProperty('$and');
      expect(Array.isArray(built.$or)).toBe(true);
      expect(Array.isArray(built.$and)).toBe(true);
    });

    it('should handle special characters in regex operations', () => {
      const built = query
        .where('email').startsWith('user+test')
        .and('description').strContains('$pecial Ch@rs!')
        .build();

      expect(built.email).toEqual({
        $regex: '^user+test',
        $options: 'i'
      });
      expect(built.description).toEqual({
        $regex: '$pecial Ch@rs!',
        $options: 'i'
      });
    });

    it('should handle very large arrays in in() operations', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      
      const built = query.where('field').in(largeArray).build();
      
      expect(built.field.$in).toEqual(largeArray);
    });

    it('should handle numeric string ObjectIds', () => {
      const built = query.where('_id').eq('123456789012345678901234').build();
      
      expect(built._id?.toString()).toBe('123456789012345678901234');
    });

    it('should handle geospatial queries with extreme coordinates', () => {
      const extremeBounds = {
        ne: { latitude: 90, longitude: 180 },
        sw: { latitude: -90, longitude: -180 }
      };

      const built = query.where('location').geoWithin(extremeBounds).build();

      expect(built.location.$geoWithin.$geometry.coordinates[0]).toEqual([
        [180, 90],
        [180, -90],
        [-180, -90],
        [-180, 90],
        [180, 90]
      ]);
    });

    it('should handle ordering with undefined field', () => {
      query.orderBy(undefined, SortDirection.Ascending);
      const options = query.buildOptions();

      expect(options.sort).toBeUndefined();
    });

    it('should handle multiple orderBy calls (last one wins)', () => {
      query
        .orderBy('field1', SortDirection.Ascending)
        .orderBy('field2', SortDirection.Descending);

      const options = query.buildOptions();

      expect(options.sort).toEqual({
        field2: -1
      });
    });

    it('should handle pagination with zero values', () => {
      const options = query.buildOptions({ offset: 0, count: 0 });

      expect(options.skip).toBe(0);
      expect(options.limit).toBe(0);
    });

    it('should handle inRange with same min and max', () => {
      const built = query.inRange('price', 100, 100).build();

      expect(built.price).toEqual({
        $gte: 100,
        $lte: 100
      });
    });

    it('should handle inRange with inverted min/max', () => {
      const built = query.inRange('price', 200, 100).build();

      expect(built.price).toEqual({
        $gte: 200,
        $lte: 100
      });
    });
  });

  // FlongoCollection edge cases are covered in flongoCollection.test.ts
});