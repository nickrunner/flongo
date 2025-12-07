/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Bounds,
  Coordinates,
  Pagination,
  ColExpression,
  ColRange,
  ICollectionQuery,
  Logic,
  SortDirection
} from "./types";
import { geohashQueryBounds } from "geofire-common";
import { Document, Filter, FindOptions, ObjectId } from "mongodb";

/**
 * FlongoQuery provides a fluent, chainable interface for building MongoDB queries
 * similar to Firestore's query API. It allows developers to construct complex queries
 * using method chaining rather than building MongoDB filter objects manually.
 *
 * Example usage:
 * ```typescript
 * const query = new FlongoQuery()
 *   .where('age').gtEq(18)
 *   .and('status').eq('active')
 *   .and('tags').arrContainsAny(['developer', 'designer'])
 *   .orderBy('createdAt', SortDirection.Descending);
 * ```
 */
export class FlongoQuery implements ICollectionQuery {
  /** Array of field expressions (where conditions) */
  public expressions: ColExpression[] = [];

  /** Array of range queries (currently unused but reserved for future features) */
  public ranges: ColRange[] = [];

  /** Field to sort results by */
  public orderField?: string;

  /** Direction for sorting (ascending or descending) */
  public orderDirection?: SortDirection;

  /** Array of queries to be combined with OR logic */
  public orQueries: FlongoQuery[] = [];

  /** Array of queries to be combined with AND logic */
  public andQueries: FlongoQuery[] = [];

  /**
   * Gets the most recently added expression for method chaining
   * @private
   * @returns The last expression in the expressions array
   */
  private exp(): ColExpression {
    return this.expressions[this.expressions.length - 1];
  }

  /**
   * Sets the operator and value for the most recent expression
   * If value is null or undefined, removes the last expression (allows for conditional chaining)
   * @private
   * @param op - MongoDB operator (e.g., '$eq', '$gt', '$in')
   * @param val - Value to compare against
   * @returns This query instance for chaining
   */
  public set(op?: string, val?: any): FlongoQuery {
    if (val === null || val === undefined) {
      // Remove the expression if no value is provided
      // This allows conditional chaining like .where('field').eq(maybeUndefinedValue)
      this.expressions.pop();
      return this;
    }
    this.exp().op = op;
    this.exp().val = val;

    return this;
  }

  /**
   * Helper method to handle empty/invalid values by removing the last expression
   * @private
   * @returns This query instance for chaining
   */
  private handleEmptyValue(): FlongoQuery {
    this.expressions.pop();
    return this;
  }

  /**
   * Sets a range query on a field (currently unused but reserved for future features)
   * @param key - Field name to query
   * @param start - Start value of the range
   * @param end - End value of the range
   * @param orderField - Field to order by for range queries
   */
  public setRange(key: string, start: any, end: any, orderField: string) {
    this.orderBy(orderField);
    this.ranges.push({ key: key, start: start, end: end });
  }

  /**
   * Starts a new where clause for the specified field
   * @param key - Field name to query
   * @returns This query instance for chaining
   */
  public where(key: string): FlongoQuery {
    this.expressions.push(new ColExpression(key));
    return this;
  }

  /**
   * Alias for where() - adds another field constraint with AND logic
   * @param key - Field name to query
   * @returns This query instance for chaining
   */
  public and(key: string): FlongoQuery {
    this.where(key);
    return this;
  }

  // ===========================================
  // COMPARISON OPERATORS
  // ===========================================

  /**
   * Adds equality constraint to the current field
   * @param val - Value to match exactly
   * @returns This query instance for chaining
   */
  public eq(val?: any): FlongoQuery {
    return this.set("$eq", val);
  }

  /**
   * Adds not-equal constraint to the current field
   * @param val - Value to exclude
   * @returns This query instance for chaining
   */
  public neq(val?: any): FlongoQuery {
    return this.set("$ne", val);
  }

  /**
   * Adds less-than constraint to the current field
   * @param val - Upper bound (exclusive)
   * @returns This query instance for chaining
   */
  public lt(val?: any): FlongoQuery {
    return this.set("$lt", val);
  }

  /**
   * Adds less-than-or-equal constraint to the current field
   * @param val - Upper bound (inclusive)
   * @returns This query instance for chaining
   */
  public ltEq(val?: any): FlongoQuery {
    return this.set("$lte", val);
  }

  /**
   * Adds greater-than constraint to the current field
   * @param val - Lower bound (exclusive)
   * @returns This query instance for chaining
   */
  public gt(val?: any): FlongoQuery {
    return this.set("$gt", val);
  }

  /**
   * Adds greater-than-or-equal constraint to the current field
   * @param val - Lower bound (inclusive)
   * @returns This query instance for chaining
   */
  public gtEq(val?: any): FlongoQuery {
    return this.set("$gte", val);
  }

  // ===========================================
  // ARRAY OPERATORS
  // ===========================================

  /**
   * Checks if array field contains the specified value
   * @param val - Value that must be present in the array
   * @returns This query instance for chaining
   */
  public arrContains(val?: any): FlongoQuery {
    return this.set(undefined, val);
  }

  /**
   * Checks if array field contains all of the specified values
   * @param val - Array of values that must all be present
   * @returns This query instance for chaining
   */
  public arrContainsAll(val?: any): FlongoQuery {
    return this.set("$all", val);
  }

  /**
   * Checks if array field contains any of the specified values
   * If empty array is provided, removes the expression
   * @param val - Array of values, any of which may be present
   * @returns This query instance for chaining
   */
  public arrContainsAny(val?: any[]): FlongoQuery {
    return val?.length ? this.set("$in", val) : this.handleEmptyValue();
  }

  /**
   * Matches array elements that satisfy all specified conditions.
   * Use this to query objects within arrays by their properties.
   *
   * @example
   * // Find users with a contextRole where orgId is 'org1'
   * query.where('contextRoles').elemMatch({ orgId: 'org1' })
   *
   * @example
   * // Find users with a contextRole where orgId is 'org1' AND role is 'admin'
   * query.where('contextRoles').elemMatch({ orgId: 'org1', role: 'admin' })
   *
   * @example
   * // Using fluent API for conditions (supports all FlongoQuery operators)
   * query.where('contextRoles').elemMatch(
   *   new FlongoQuery().where('orgId').eq('org1').and('role').eq('admin')
   * )
   *
   * @example
   * // Using comparison operators
   * query.where('scores').elemMatch(
   *   new FlongoQuery().where('value').gtEq(80).and('subject').eq('math')
   * )
   *
   * @param conditions - Object with field/value pairs or a FlongoQuery instance
   * @returns This query instance for chaining
   */
  public elemMatch(conditions?: Record<string, any> | FlongoQuery): FlongoQuery {
    return this.set("$elemMatch", conditions);
  }

  // ===========================================
  // STRING OPERATORS
  // ===========================================

  /**
   * Adds case-insensitive string starts-with constraint
   * @param val - String prefix to match
   * @returns This query instance for chaining
   */
  public startsWith(val: string): FlongoQuery {
    return this.set("$regex", "^" + val);
  }

  /**
   * Adds case-insensitive string ends-with constraint
   * @param val - String suffix to match
   * @returns This query instance for chaining
   */
  public endsWith(val: string): FlongoQuery {
    return this.set("$regex", val + "$");
  }

  /**
   * Adds case-insensitive string contains constraint
   * @param val - Substring to search for
   * @returns This query instance for chaining
   */
  public strContains(val: string): FlongoQuery {
    return this.set("$regex", val);
  }

  /**
   * Helper method to apply comparison operators with null/empty checks
   * @private
   * @param op - MongoDB operator
   * @param val - Array of values
   * @returns This query instance for chaining
   */
  private applyComparisonOperator(op: string, val?: any[]): FlongoQuery {
    if (val) {
      this.set(op, val);
    } else {
      // Remove expression if no values provided
      this.expressions.pop();
    }
    return this;
  }

  /**
   * Checks if field value is in the provided array
   * @param val - Array of possible values
   * @returns This query instance for chaining
   */
  public in(val?: any[]): FlongoQuery {
    return val?.length ? this.applyComparisonOperator("$in", val) : this.handleEmptyValue();
  }

  /**
   * Checks if field value is NOT in the provided array
   * @param val - Array of values to exclude
   * @returns This query instance for chaining
   */
  public notIn(val?: any[]): FlongoQuery {
    return val?.length ? this.applyComparisonOperator("$nin", val) : this.handleEmptyValue();
  }

  /**
   * Convenience method for range queries (field >= min AND field <= max)
   * @param key - Field name
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns This query instance for chaining
   */
  public inRange(key: string, min: any, max: any): FlongoQuery {
    return this.where(key).gtEq(min).and(key).ltEq(max);
  }

  // ===========================================
  // GEOSPATIAL OPERATORS
  // ===========================================

  /**
   * Performs geospatial radius search using geohash bounds
   * This method uses the geofire-common library to generate geohash query bounds
   * and creates OR queries for each bound to efficiently search within a radius
   * @param key - Field containing geohash data
   * @param center - Center point coordinates
   * @param radius - Search radius in meters
   * @returns This query instance for chaining
   */
  public inRadius(key: string, center: Coordinates, radius: number): FlongoQuery {
    // Generate geohash bounds for the given center and radius
    const geoBounds = geohashQueryBounds([center.latitude, center.longitude], radius);

    // Order by geohash field for optimal query performance
    this.orderBy(key, SortDirection.Ascending);

    // Create OR queries for each geohash bound range
    for (const b of geoBounds) {
      this.or(new FlongoQuery().inRange(key, b[0], b[1]));
    }
    return this;
  }

  /**
   * Performs geospatial query within rectangular bounds
   * Creates a GeoJSON polygon from the provided bounds
   * @param bounds - Rectangular bounds with northeast and southwest corners
   * @returns This query instance for chaining
   */
  public geoWithin(bounds?: Bounds): FlongoQuery {
    if (bounds) {
      // Create GeoJSON polygon from bounds
      // MongoDB requires coordinates in [longitude, latitude] format
      // Polygon must be closed (first and last coordinates identical)
      this.set("$geoWithin", {
        $geometry: {
          type: "Polygon",
          coordinates: [
            [
              [bounds.ne.longitude, bounds.ne.latitude], // Top-right
              [bounds.ne.longitude, bounds.sw.latitude], // Bottom-right
              [bounds.sw.longitude, bounds.sw.latitude], // Bottom-left
              [bounds.sw.longitude, bounds.ne.latitude], // Top-left
              [bounds.ne.longitude, bounds.ne.latitude] // Close polygon
            ]
          ]
        }
      });
    } else {
      // Remove expression if no bounds provided
      this.expressions.pop();
    }

    return this;
  }

  // ===========================================
  // SORTING
  // ===========================================

  /**
   * Sets the field and direction for sorting results
   * @param field - Field name to sort by
   * @param direction - Sort direction (ascending or descending)
   * @returns This query instance for chaining
   */
  public orderBy(field?: string, direction?: SortDirection): FlongoQuery {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  // ===========================================
  // LOGICAL OPERATORS
  // ===========================================

  /**
   * Adds a sub-query with AND logic
   * @param query - Sub-query to combine with AND logic
   * @returns This query instance for chaining
   */
  public andQuery(query: FlongoQuery): FlongoQuery {
    this.andQueries.push(query);
    return this;
  }

  /**
   * Adds a sub-query with OR logic
   * @param query - Sub-query to combine with OR logic
   * @returns This query instance for chaining
   */
  public or(query: FlongoQuery): FlongoQuery {
    this.orQueries.push(query);
    return this;
  }

  // ===========================================
  // QUERY BUILDING
  // ===========================================

  /**
   * Builds the final MongoDB filter object from all expressions and sub-queries
   * This method converts the fluent query structure into a MongoDB-compatible filter
   * @returns MongoDB filter object
   */
  public build<T>(): Filter<T> {
    let mongodbQuery: any = {};

    try {
      // Process main expressions
      if (this.expressions) {
        for (const expression of this.expressions) {
          // Special handling for _id field - convert strings to ObjectIds
          if (expression.key === "_id") {
            if (Array.isArray(expression.val)) {
              // Multiple IDs: {_id: {$in: [ObjectId(...), ObjectId(...)]}}
              mongodbQuery = {
                _id: {
                  [expression.op ?? "$in"]: expression.val.map((element) => new ObjectId(element))
                }
              };
            } else {
              // Single ID: {_id: ObjectId(...)}
              mongodbQuery = { _id: new ObjectId(expression.val) } as any;
            }
            break; // _id queries are typically exclusive
          }

          // Build query object for non-_id fields
          let fieldValue: any;
          if (!expression.op) {
            // Direct value assignment for simple equality (arrContains)
            fieldValue = expression.val;
          } else if (expression.op === "$regex") {
            // Case-insensitive regex
            fieldValue = { [expression.op]: expression.val, ["$options"]: "i" };
          } else if (expression.op === "$elemMatch") {
            // Handle FlongoQuery or raw object for $elemMatch
            fieldValue = {
              [expression.op]:
                expression.val instanceof FlongoQuery ? expression.val.build() : expression.val
            };
          } else {
            // Standard operator
            fieldValue = { [expression.op]: expression.val };
          }

          // Merge operators for the same field (e.g., range queries)
          if (
            mongodbQuery[expression.key] &&
            typeof mongodbQuery[expression.key] === "object" &&
            typeof fieldValue === "object"
          ) {
            mongodbQuery[expression.key] = { ...mongodbQuery[expression.key], ...fieldValue };
          } else {
            mongodbQuery[expression.key] = fieldValue;
          }
        }
      }

      // Add OR sub-queries
      if (this.orQueries.length > 0) {
        mongodbQuery["$or"] = [];
        for (const query of this.orQueries) {
          mongodbQuery["$or"].push(query.build());
        }
      }

      // Add AND sub-queries
      if (this.andQueries.length > 0) {
        mongodbQuery["$and"] = [];
        for (const query of this.andQueries) {
          mongodbQuery["$and"].push(query.build());
        }
      }
    } catch (err: any) {
      console.log("Failed building query: ", err);
      throw err;
    }

    // Note: Range queries are currently commented out but reserved for future use
    // if (query.ranges) {
    //   query.ranges.forEach((range) => {
    //     mongodbQuery[range.key as keyof Filter<T>] = {
    //       $gte: range.start,
    //       $lt: range.end
    //     };
    //   });
    // }

    return mongodbQuery;
  }

  /**
   * Builds MongoDB FindOptions for pagination and sorting
   * @param pagination - Optional pagination settings
   * @returns MongoDB FindOptions object
   */
  public buildOptions<T extends Document>(pagination?: Pagination): FindOptions<T> {
    const mongodbOptions: FindOptions<T> = {};

    // Add pagination if provided
    if (pagination) {
      mongodbOptions.skip = pagination.offset;
      mongodbOptions.limit = pagination.count;
    }

    // Add sorting if specified
    if (this.orderField && this.orderDirection) {
      mongodbOptions.sort = {
        [this.orderField]: this.orderDirection === SortDirection.Ascending ? 1 : -1
      };
    }

    return mongodbOptions;
  }
}

/**
 * FlongoQueryBuilder provides a builder pattern wrapper around FlongoQuery
 * This can be useful for more complex query construction scenarios
 */
export class FlongoQueryBuilder {
  /** The underlying query instance */
  public q: FlongoQuery = new FlongoQuery();
}

export { Logic };
