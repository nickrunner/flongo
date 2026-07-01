import { describe, it, expect, beforeEach } from "vitest";
import { FlongoQuery, FlongoQueryBuilder } from "../flongoQuery";
import { SortDirection, Logic } from "../types";

describe("FlongoQuery", () => {
  let query: FlongoQuery;

  beforeEach(() => {
    query = new FlongoQuery();
  });

  describe("Basic Query Building", () => {
    it("should create an empty query by default", () => {
      const built = query.build();
      expect(built).toEqual({});
    });

    it("should handle simple where clause", () => {
      const built = query.where("name").eq("John").build();
      expect(built).toEqual({
        name: { $eq: "John" }
      });
    });

    it("should handle multiple where clauses with AND logic", () => {
      const built = query.where("name").eq("John").and("age").gt(25).build();

      expect(built).toEqual({
        name: { $eq: "John" },
        age: { $gt: 25 }
      });
    });
  });

  describe("Comparison Operators", () => {
    it("should handle equality", () => {
      const built = query.where("status").eq("active").build();
      expect(built).toEqual({
        status: { $eq: "active" }
      });
    });

    it("should handle not equal", () => {
      const built = query.where("status").neq("deleted").build();
      expect(built).toEqual({
        status: { $ne: "deleted" }
      });
    });

    it("should handle less than", () => {
      const built = query.where("age").lt(30).build();
      expect(built).toEqual({
        age: { $lt: 30 }
      });
    });

    it("should handle less than or equal", () => {
      const built = query.where("age").ltEq(30).build();
      expect(built).toEqual({
        age: { $lte: 30 }
      });
    });

    it("should handle greater than", () => {
      const built = query.where("age").gt(18).build();
      expect(built).toEqual({
        age: { $gt: 18 }
      });
    });

    it("should handle greater than or equal", () => {
      const built = query.where("age").gtEq(18).build();
      expect(built).toEqual({
        age: { $gte: 18 }
      });
    });

    it("should remove expression when value is falsy", () => {
      const built = query.where("name").eq(null).build();
      expect(built).toEqual({});
    });
  });

  describe("Array Operators", () => {
    it("should handle array contains", () => {
      const built = query.where("tags").arrContains("developer").build();
      expect(built).toEqual({
        tags: "developer"
      });
    });

    it("should handle array contains all", () => {
      const built = query.where("skills").arrContainsAll(["js", "ts"]).build();
      expect(built).toEqual({
        skills: { $all: ["js", "ts"] }
      });
    });

    it("should handle array contains any", () => {
      const built = query.where("tags").arrContainsAny(["developer", "designer"]).build();
      expect(built).toEqual({
        tags: { $in: ["developer", "designer"] }
      });
    });

    it("should remove expression when arrContainsAny gets empty array", () => {
      const built = query.where("tags").arrContainsAny([]).build();
      expect(built).toEqual({});
    });

    it("should handle in operator", () => {
      const built = query.where("id").in(["1", "2", "3"]).build();
      expect(built).toEqual({
        id: { $in: ["1", "2", "3"] }
      });
    });

    it("should handle not in operator", () => {
      const built = query.where("status").notIn(["deleted", "banned"]).build();
      expect(built).toEqual({
        status: { $nin: ["deleted", "banned"] }
      });
    });

    it("should ignore notIn with empty array", () => {
      const built = query.where("status").notIn([]).build();
      expect(built).toEqual({});
    });

    describe("elemMatch", () => {
      it("should handle elemMatch with plain object", () => {
        const built = query.where("contextRoles").elemMatch({ orgId: "org1" }).build();
        expect(built).toEqual({
          contextRoles: { $elemMatch: { orgId: "org1" } }
        });
      });

      it("should handle elemMatch with multiple conditions in object", () => {
        const built = query
          .where("contextRoles")
          .elemMatch({ orgId: "org1", role: "admin" })
          .build();
        expect(built).toEqual({
          contextRoles: { $elemMatch: { orgId: "org1", role: "admin" } }
        });
      });

      it("should handle elemMatch with FlongoQuery", () => {
        const built = query
          .where("contextRoles")
          .elemMatch(new FlongoQuery().where("orgId").eq("org1"))
          .build();
        expect(built).toEqual({
          contextRoles: { $elemMatch: { orgId: { $eq: "org1" } } }
        });
      });

      it("should handle elemMatch with FlongoQuery and multiple conditions", () => {
        const built = query
          .where("contextRoles")
          .elemMatch(new FlongoQuery().where("orgId").eq("org1").and("role").eq("admin"))
          .build();
        expect(built).toEqual({
          contextRoles: { $elemMatch: { orgId: { $eq: "org1" }, role: { $eq: "admin" } } }
        });
      });

      it("should handle elemMatch with comparison operators in FlongoQuery", () => {
        const built = query
          .where("scores")
          .elemMatch(new FlongoQuery().where("value").gtEq(80).and("subject").eq("math"))
          .build();
        expect(built).toEqual({
          scores: { $elemMatch: { value: { $gte: 80 }, subject: { $eq: "math" } } }
        });
      });

      it("should handle elemMatch combined with other query conditions", () => {
        const built = query
          .where("status")
          .eq("active")
          .and("contextRoles")
          .elemMatch({ orgId: "org1" })
          .build();
        expect(built).toEqual({
          status: { $eq: "active" },
          contextRoles: { $elemMatch: { orgId: "org1" } }
        });
      });

      it("should remove expression when elemMatch gets null/undefined", () => {
        const built = query.where("contextRoles").elemMatch(undefined).build();
        expect(built).toEqual({});
      });
    });
  });

  describe("String Operators", () => {
    it("should handle starts with", () => {
      const built = query.where("name").startsWith("John").build();
      expect(built).toEqual({
        name: { $regex: "^John", $options: "i" }
      });
    });

    it("should handle ends with", () => {
      const built = query.where("email").endsWith("@gmail.com").build();
      expect(built).toEqual({
        email: { $regex: "@gmail.com$", $options: "i" }
      });
    });

    it("should handle string contains", () => {
      const built = query.where("description").strContains("developer").build();
      expect(built).toEqual({
        description: { $regex: "developer", $options: "i" }
      });
    });
  });

  describe("Range Queries", () => {
    it("should handle inRange helper", () => {
      const built = query.inRange("age", 18, 65).build();
      expect(built).toEqual({
        age: { $gte: 18, $lte: 65 }
      });
    });
  });

  describe("Geospatial Queries", () => {
    it("should handle geoWithin", () => {
      const bounds = {
        ne: { latitude: 40.7829, longitude: -73.9441 },
        sw: { latitude: 40.7489, longitude: -73.9841 }
      };

      const built = query.where("location").geoWithin(bounds).build();

      expect(built).toEqual({
        location: {
          $geoWithin: {
            $geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-73.9441, 40.7829],
                  [-73.9441, 40.7489],
                  [-73.9841, 40.7489],
                  [-73.9841, 40.7829],
                  [-73.9441, 40.7829]
                ]
              ]
            }
          }
        }
      });
    });

    it("should remove expression when geoWithin gets no bounds", () => {
      const built = query.where("location").geoWithin().build();
      expect(built).toEqual({});
    });

    it("should handle near query", () => {
      const center = { latitude: 42.96, longitude: -85.67 };
      const built = query.where("location").near(center, 500).build();

      expect(built).toEqual({
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [-85.67, 42.96]
            },
            $maxDistance: 500
          }
        }
      });
    });

    it("should chain near with other conditions", () => {
      const center = { latitude: 40.7589, longitude: -73.9851 };
      const built = query
        .where("location").near(center, 1000)
        .and("status").eq("active")
        .build();

      expect(built).toEqual({
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [-73.9851, 40.7589]
            },
            $maxDistance: 1000
          }
        },
        status: { $eq: "active" }
      });
    });

    it("should handle inRadius with geohash bounds", () => {
      const center = { latitude: 40.7589, longitude: -73.9851 };
      const radius = 1000;

      const builtQuery = query.inRadius("geohash", center, radius);

      // Should have OR queries for geohash bounds
      expect(builtQuery.orQueries.length).toBeGreaterThan(0);
      expect(builtQuery.orderField).toBe("geohash");
      expect(builtQuery.orderDirection).toBe(SortDirection.Ascending);
    });
  });

  describe("ObjectId Handling", () => {
    it("should handle single _id query", () => {
      const built = query.where("_id").eq("507f1f77bcf86cd799439011").build();
      expect(built._id?.toString()).toBe("507f1f77bcf86cd799439011");
    });

    it("should handle multiple _id query", () => {
      const ids = ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"];
      const built = query.where("_id").in(ids).build();

      expect(built._id.$in).toHaveLength(2);
      expect(built._id.$in[0].toString()).toBe(ids[0]);
      expect(built._id.$in[1].toString()).toBe(ids[1]);
    });
  });

  describe("Logical Operators", () => {
    it("should handle OR queries", () => {
      const built = query
        .where("status")
        .eq("active")
        .or(new FlongoQuery().where("featured").eq(true))
        .build();

      expect(built).toEqual({
        status: { $eq: "active" },
        $or: [{ featured: { $eq: true } }]
      });
    });

    it("should handle multiple OR queries", () => {
      const built = query
        .where("status")
        .eq("active")
        .or(new FlongoQuery().where("featured").eq(true))
        .or(new FlongoQuery().where("priority").eq("high"))
        .build();

      expect(built.$or).toHaveLength(2);
    });

    it("should handle AND queries", () => {
      const subQuery = new FlongoQuery().where("verified").eq(true);
      const built = query.where("status").eq("active").andQuery(subQuery).build();

      expect(built).toEqual({
        status: { $eq: "active" },
        $and: [{ verified: { $eq: true } }]
      });
    });

    it("should add AND query and return this for chaining", () => {
      const emptyQuery = new FlongoQuery();
      const subQuery = new FlongoQuery().where("verified").eq(true);

      const result = emptyQuery.andQuery(subQuery);
      const built = emptyQuery.build();

      expect(result).toBe(emptyQuery); // Returns this query for chaining
      expect(built).toEqual({
        $and: [{ verified: { $eq: true } }]
      }); // AND query is added even to empty query
    });
  });

  describe("Sorting", () => {
    it("should handle orderBy", () => {
      query.orderBy("createdAt", SortDirection.Descending);

      expect(query.orderField).toBe("createdAt");
      expect(query.orderDirection).toBe(SortDirection.Descending);
    });

    it("should build sort options", () => {
      query.orderBy("name", SortDirection.Ascending);
      const options = query.buildOptions();

      expect(options.sort).toEqual({
        name: 1
      });
    });

    it("should build descending sort options", () => {
      query.orderBy("createdAt", SortDirection.Descending);
      const options = query.buildOptions();

      expect(options.sort).toEqual({
        createdAt: -1
      });
    });

    it("should append a tiebreaker with thenBy", () => {
      query
        .orderBy("featured", SortDirection.Descending)
        .thenBy("_id", SortDirection.Ascending);

      const options = query.buildOptions();

      expect(options.sort).toEqual({
        featured: -1,
        _id: 1
      });
      // Key insertion order must be preserved (primary first, then tiebreaker)
      expect(Object.keys(options.sort as object)).toEqual(["featured", "_id"]);
    });

    it("should support three-level sorting in order", () => {
      query
        .orderBy("featured", SortDirection.Descending)
        .thenBy("createdAt", SortDirection.Descending)
        .thenBy("_id", SortDirection.Ascending);

      const options = query.buildOptions();

      expect(Object.keys(options.sort as object)).toEqual([
        "featured",
        "createdAt",
        "_id"
      ]);
      expect(options.sort).toEqual({
        featured: -1,
        createdAt: -1,
        _id: 1
      });
    });

    it("should treat thenBy as primary when no orderBy was called", () => {
      query.thenBy("_id", SortDirection.Ascending);

      expect(query.orderField).toBe("_id");
      expect(query.orderDirection).toBe(SortDirection.Ascending);
      expect(query.buildOptions().sort).toEqual({ _id: 1 });
    });

    it("should reset tiebreakers when orderBy is called again", () => {
      query
        .orderBy("featured", SortDirection.Descending)
        .thenBy("_id", SortDirection.Ascending)
        .orderBy("name", SortDirection.Ascending);

      expect(query.buildOptions().sort).toEqual({ name: 1 });
      expect(query.orderField).toBe("name");
    });

    it("should de-dupe a repeated thenBy field (last direction wins, position kept)", () => {
      query
        .orderBy("featured", SortDirection.Descending)
        .thenBy("_id", SortDirection.Ascending)
        .thenBy("_id", SortDirection.Descending);

      const options = query.buildOptions();

      expect(Object.keys(options.sort as object)).toEqual(["featured", "_id"]);
      expect(options.sort).toEqual({
        featured: -1,
        _id: -1
      });
    });

    it("should keep orderField/orderDirection reflecting the primary sort key", () => {
      query
        .orderBy("featured", SortDirection.Descending)
        .thenBy("_id", SortDirection.Ascending);

      expect(query.orderField).toBe("featured");
      expect(query.orderDirection).toBe(SortDirection.Descending);
    });

    it("should produce the previous single-orderBy sort shape (back-compat)", () => {
      query.orderBy("createdAt", SortDirection.Descending);

      // Byte-identical to the pre-thenBy output: a single-key sort object.
      expect(query.buildOptions().sort).toEqual({ createdAt: -1 });
    });
  });

  describe("Random sort (orderByRandom)", () => {
    const SHUFFLE = FlongoQuery.SHUFFLE_FIELD;

    // Extract the single-key operator stage of the given type from a pipeline.
    const stage = (pipeline: any[], key: string) => pipeline.find((s) => key in s)?.[key];

    it("should not carry a random sort by default", () => {
      expect(query.hasRandomSort()).toBe(false);
    });

    it("should flag a random sort once orderByRandom is called", () => {
      query.orderByRandom(42);
      expect(query.hasRandomSort()).toBe(true);
    });

    it("should normalize number and string seeds to the same hash input", () => {
      const num = new FlongoQuery().orderByRandom(1).buildPipeline();
      const str = new FlongoQuery().orderByRandom("1").buildPipeline();
      expect(stage(num, "$addFields")).toEqual(stage(str, "$addFields"));
    });

    it("should build a pipeline: match, addFields hash, sort, project", () => {
      const pipeline = query.where("enable").eq(true).orderByRandom("seed-1").buildPipeline();

      expect(stage(pipeline, "$match")).toEqual({ enable: { $eq: true } });
      expect(stage(pipeline, "$addFields")).toEqual({
        [SHUFFLE]: {
          $toHashedIndexKey: { $concat: [{ $toString: "$_id" }, ":", "seed-1"] }
        }
      });
      // No pagination supplied -> no skip/limit stages.
      expect(stage(pipeline, "$skip")).toBeUndefined();
      expect(stage(pipeline, "$limit")).toBeUndefined();
      // Internal shuffle field is projected out.
      expect(stage(pipeline, "$project")).toEqual({ [SHUFFLE]: 0 });
    });

    it("should shuffle the whole set with _id as final tiebreaker when alone", () => {
      const pipeline = query.orderByRandom(7).buildPipeline();
      expect(stage(pipeline, "$sort")).toEqual({ [SHUFFLE]: 1, _id: 1 });
      expect(Object.keys(stage(pipeline, "$sort"))).toEqual([SHUFFLE, "_id"]);
    });

    it("should slot the shuffle after explicit sort keys declared before it", () => {
      const pipeline = query
        .orderBy("featured", SortDirection.Descending)
        .orderByRandom(7)
        .buildPipeline();

      // featured pinned on top, shuffle within each tier, _id last.
      expect(Object.keys(stage(pipeline, "$sort"))).toEqual(["featured", SHUFFLE, "_id"]);
      expect(stage(pipeline, "$sort")).toEqual({ featured: -1, [SHUFFLE]: 1, _id: 1 });
    });

    it("should slot the shuffle at its call position amongst mixed sort keys", () => {
      const pipeline = query
        .orderBy("featured", SortDirection.Descending)
        .orderByRandom(7)
        .thenBy("name", SortDirection.Ascending)
        .buildPipeline();

      // Call order: featured, random, name -> then _id tiebreaker.
      expect(Object.keys(stage(pipeline, "$sort"))).toEqual([
        "featured",
        SHUFFLE,
        "name",
        "_id"
      ]);
    });

    it("should not duplicate _id if it is already an explicit sort key", () => {
      const pipeline = query
        .orderByRandom(7)
        .thenBy("_id", SortDirection.Descending)
        .buildPipeline();

      const sort = stage(pipeline, "$sort");
      expect(Object.keys(sort)).toEqual([SHUFFLE, "_id"]);
      // Explicit _id direction is preserved (not overwritten by the tiebreaker).
      expect(sort._id).toBe(-1);
    });

    it("should append skip/limit after the sort when paginated", () => {
      const pipeline = query.orderByRandom(7).buildPipeline({ offset: 20, count: 10 });

      expect(stage(pipeline, "$skip")).toBe(20);
      expect(stage(pipeline, "$limit")).toBe(10);
      // Ordering matters: sort must precede skip/limit for stable paging.
      const idx = (k: string) => pipeline.findIndex((s) => k in s);
      expect(idx("$sort")).toBeLessThan(idx("$skip"));
      expect(idx("$skip")).toBeLessThan(idx("$limit"));
    });

    it("should be deterministic: identical query+seed yields identical pipeline", () => {
      const a = new FlongoQuery().where("enable").eq(true).orderByRandom(99).buildPipeline();
      const b = new FlongoQuery().where("enable").eq(true).orderByRandom(99).buildPipeline();
      expect(a).toEqual(b);
    });

    it("should reshuffle when the seed changes", () => {
      const a = new FlongoQuery().orderByRandom(1).buildPipeline();
      const b = new FlongoQuery().orderByRandom(2).buildPipeline();
      expect(stage(a, "$addFields")).not.toEqual(stage(b, "$addFields"));
    });
  });

  describe("Pagination", () => {
    it("should build pagination options", () => {
      const pagination = { offset: 10, count: 20 };
      const options = query.buildOptions(pagination);

      expect(options.skip).toBe(10);
      expect(options.limit).toBe(20);
    });

    it("should combine sorting and pagination", () => {
      query.orderBy("name", SortDirection.Ascending);
      const pagination = { offset: 5, count: 15 };
      const options = query.buildOptions(pagination);

      expect(options).toEqual({
        skip: 5,
        limit: 15,
        sort: { name: 1 }
      });
    });
  });

  describe("Complex Queries", () => {
    it("should handle complex multi-field query", () => {
      const built = query
        .where("age")
        .gtEq(18)
        .and("age")
        .lt(65)
        .and("status")
        .eq("active")
        .and("tags")
        .arrContainsAny(["developer", "designer"])
        .and("name")
        .startsWith("J")
        .build();

      expect(built).toEqual({
        age: { $gte: 18, $lt: 65 },
        status: { $eq: "active" },
        tags: { $in: ["developer", "designer"] },
        name: { $regex: "^J", $options: "i" }
      });
    });

    it("should handle query with OR and AND logic", () => {
      const built = query
        .where("status")
        .eq("active")
        .or(new FlongoQuery().where("featured").eq(true).and("priority").eq("high"))
        .andQuery(new FlongoQuery().where("verified").eq(true))
        .build();

      expect(built).toHaveProperty("status");
      expect(built).toHaveProperty("$or");
      expect(built).toHaveProperty("$and");
    });
  });

  describe("Error Handling", () => {
    it("should handle build errors gracefully", () => {
      // Force an error by mocking expressions to throw
      const mockQuery = new FlongoQuery();
      mockQuery.expressions = null as any;

      expect(() => mockQuery.build()).not.toThrow();
    });
  });

  describe("Method Chaining", () => {
    it("should return query instance for chaining", () => {
      const result = query.where("name").eq("John").and("age").gt(18);

      expect(result).toBe(query);
      expect(result.expressions).toHaveLength(2);
    });

    it("should support fluent interface pattern", () => {
      const built = new FlongoQuery()
        .where("status")
        .eq("active")
        .and("verified")
        .eq(true)
        .and("age")
        .gtEq(18)
        .orderBy("createdAt", SortDirection.Descending)
        .build();

      expect(built).toEqual({
        status: { $eq: "active" },
        verified: { $eq: true },
        age: { $gte: 18 }
      });
    });
  });
});

describe("FlongoQueryBuilder", () => {
  it("should create a query builder with query instance", () => {
    const builder = new FlongoQueryBuilder();

    expect(builder.q).toBeInstanceOf(FlongoQuery);
    expect(builder.q.expressions).toEqual([]);
  });

  it("should allow building complex queries through builder", () => {
    const builder = new FlongoQueryBuilder();

    builder.q.where("status").eq("active").and("age").gtEq(21);

    const built = builder.q.build();

    expect(built).toEqual({
      status: { $eq: "active" },
      age: { $gte: 21 }
    });
  });
});
