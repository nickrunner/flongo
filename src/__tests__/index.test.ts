import { describe, it, expect } from "vitest";

describe("Package Exports", () => {
  it("should export all main classes and functions", async () => {
    const flongo = await import("../index");

    // Main classes
    expect(flongo.FlongoCollection).toBeDefined();
    expect(flongo.FlongoQuery).toBeDefined();
    expect(flongo.FlongoQueryBuilder).toBeDefined();

    // Configuration
    expect(flongo.initializeFlongo).toBeDefined();
    // flongoClient and flongoDb are runtime variables, check they exist as exports
    expect("flongoClient" in flongo).toBe(true);
    expect("flongoDb" in flongo).toBe(true);

    // Error classes
    expect(flongo.Error404).toBeDefined();
    expect(flongo.Error400).toBeDefined();

    // Types and interfaces
    expect(flongo.Entity).toBeUndefined(); // Types don't exist at runtime
    expect(flongo.SortDirection).toBeDefined();
    expect(flongo.Logic).toBeDefined();
    expect(flongo.EventName).toBeDefined();
  });

  it("should export correct constructor types", async () => {
    const { FlongoCollection, FlongoQuery, FlongoQueryBuilder } = await import("../index");

    expect(typeof FlongoCollection).toBe("function");
    expect(typeof FlongoQuery).toBe("function");
    expect(typeof FlongoQueryBuilder).toBe("function");
  });

  it("should export correct function types", async () => {
    const { initializeFlongo } = await import("../index");

    expect(typeof initializeFlongo).toBe("function");
  });

  it("should export correct enum types", async () => {
    const { SortDirection, Logic, EventName } = await import("../index");

    expect(typeof SortDirection).toBe("object");
    expect(typeof Logic).toBe("object");
    expect(typeof EventName).toBe("object");

    // Check enum values
    expect(SortDirection.Ascending).toBe("asc");
    expect(SortDirection.Descending).toBe("desc");

    expect(Logic.and).toBe("and");
    expect(Logic.or).toBe("or");

    expect(EventName.CreateEntity).toBe("create_entity");
    expect(EventName.UpdateEntity).toBe("update_entity");
    expect(EventName.DeleteEntity).toBe("delete_entity");
  });

  it("should allow creating instances from exports", async () => {
    const { FlongoQuery, FlongoQueryBuilder } = await import("../index");

    const query = new FlongoQuery();
    expect(query).toBeInstanceOf(FlongoQuery);
    expect(query.expressions).toEqual([]);

    const builder = new FlongoQueryBuilder();
    expect(builder).toBeInstanceOf(FlongoQueryBuilder);
    expect(builder.q).toBeInstanceOf(FlongoQuery);
  });

  it("should maintain correct prototype chains", async () => {
    const { Error404, Error400 } = await import("../index");

    const error404 = new Error404();
    const error400 = new Error400();

    expect(error404).toBeInstanceOf(Error404);
    expect(error404).toBeInstanceOf(Error);

    expect(error400).toBeInstanceOf(Error400);
    expect(error400).toBeInstanceOf(Error);
  });
});
