import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  syncFlongoIndexes,
  registerFlongoIndexes,
  setIndexSyncConfig,
  runBootIndexSync,
  getFlongoIndexRegistry,
  getIndexSyncConfig,
  defaultIndexName,
  FlongoIndexRegistry
} from "../indexes";

// A stateful in-memory stand-in for a MongoDB collection's index surface. Each
// collection tracks its index names and lets tests script createIndex/dropIndex
// behavior (conflicts, failures) per index.
class MockIndexedCollection {
  public indexes: Array<{ name: string; key: Record<string, any> }> = [
    { name: "_id_", key: { _id: 1 } }
  ];

  // name -> queue of errors to throw on successive creates of that index
  // (simulates conflict/failure; an exhausted queue means creation succeeds)
  public createErrors = new Map<string, any[]>();

  failCreate(name: string, ...errors: any[]): void {
    this.createErrors.set(name, [...(this.createErrors.get(name) ?? []), ...errors]);
  }

  createIndex = vi.fn(async (keys: Record<string, any>, options: any = {}) => {
    const name = options.name ?? defaultIndexName(keys);
    const queue = this.createErrors.get(name);
    if (queue?.length) {
      throw queue.shift();
    }
    if (!this.indexes.find((i) => i.name === name)) {
      this.indexes.push({ name, key: keys });
    }
    return name;
  });

  dropIndex = vi.fn(async (name: string) => {
    this.indexes = this.indexes.filter((i) => i.name !== name);
  });

  listIndexes = vi.fn(() => ({
    toArray: vi.fn(async () => this.indexes.map((i) => ({ ...i })))
  }));
}

const collections = new Map<string, MockIndexedCollection>();

function getCollection(name: string): MockIndexedCollection {
  if (!collections.has(name)) {
    collections.set(name, new MockIndexedCollection());
  }
  return collections.get(name)!;
}

vi.mock("../flongo", () => {
  return {
    flongoDb: {
      collection: vi.fn((name: string) => getCollection(name))
    },
    flongoClient: {},
    initializeFlongo: vi.fn()
  };
});

const conflictError = (msg = "Index already exists with different options") => {
  const err: any = new Error(msg);
  err.code = 85;
  err.codeName = "IndexOptionsConflict";
  return err;
};

const duplicateKeyError = () => {
  const err: any = new Error("E11000 duplicate key error");
  err.code = 11000;
  return err;
};

describe("Declarative index management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collections.clear();
    registerFlongoIndexes({});
    setIndexSyncConfig({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("defaultIndexName", () => {
    it("mirrors MongoDB's generated names", () => {
      expect(defaultIndexName({ name: 1, "value.stayId": 1, createdAt: 1 })).toBe(
        "name_1_value.stayId_1_createdAt_1"
      );
      expect(defaultIndexName({ a: 1, b: -1 })).toBe("a_1_b_-1");
      expect(defaultIndexName({ "location.coordinates.geoJSON": "2dsphere" })).toBe(
        "location.coordinates.geoJSON_2dsphere"
      );
    });
  });

  describe("registry state", () => {
    it("stores and returns the registry and sync config", () => {
      const registry: FlongoIndexRegistry = { users: [{ keys: { email: 1 } }] };
      registerFlongoIndexes(registry);
      setIndexSyncConfig({ mode: "strict", onError: "throw" });
      expect(getFlongoIndexRegistry()).toBe(registry);
      expect(getIndexSyncConfig()).toEqual({ mode: "strict", onError: "throw" });
    });

    it("clears the registry when passed undefined", () => {
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });
      registerFlongoIndexes(undefined);
      expect(getFlongoIndexRegistry()).toEqual({});
    });
  });

  describe("creation and idempotency", () => {
    it("creates missing indexes and reports created", async () => {
      registerFlongoIndexes({
        events: [
          { keys: { name: 1, "value.stayId": 1, createdAt: 1 } },
          { keys: { name: 1, identity: 1, createdAt: 1 } }
        ]
      });

      const reports = await syncFlongoIndexes();

      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.status === "created")).toBe(true);
      expect(reports.map((r) => r.name)).toEqual([
        "name_1_value.stayId_1_createdAt_1",
        "name_1_identity_1_createdAt_1"
      ]);
      expect(getCollection("events").createIndex).toHaveBeenCalledTimes(2);
    });

    it("is idempotent: a second run reports all exists with no errors", async () => {
      registerFlongoIndexes({
        users: [{ keys: { email: 1 }, options: { unique: true } }]
      });

      const first = await syncFlongoIndexes();
      expect(first[0].status).toBe("created");

      const second = await syncFlongoIndexes();
      expect(second).toHaveLength(1);
      expect(second[0].status).toBe("exists");
      expect(second[0].error).toBeUndefined();
    });

    it("passes options through to createIndex verbatim", async () => {
      registerFlongoIndexes({
        stays: [
          { keys: { shortlink: 1 }, options: { unique: true, sparse: true } },
          { keys: { "location.coordinates.geoJSON": "2dsphere" } },
          {
            keys: { status: 1 },
            options: { partialFilterExpression: { status: "active" }, name: "active_status" }
          },
          { keys: { archivedAtDate: 1 }, options: { expireAfterSeconds: 3600 } },
          { keys: { title: 1 }, options: { collation: { locale: "en", strength: 2 } } },
          { keys: { legacy: 1 }, options: { hidden: true } }
        ]
      });

      await syncFlongoIndexes();

      const create = getCollection("stays").createIndex;
      expect(create).toHaveBeenCalledWith({ shortlink: 1 }, { unique: true, sparse: true });
      expect(create).toHaveBeenCalledWith(
        { "location.coordinates.geoJSON": "2dsphere" },
        {}
      );
      expect(create).toHaveBeenCalledWith(
        { status: 1 },
        { partialFilterExpression: { status: "active" }, name: "active_status" }
      );
      expect(create).toHaveBeenCalledWith({ archivedAtDate: 1 }, { expireAfterSeconds: 3600 });
      expect(create).toHaveBeenCalledWith(
        { title: 1 },
        { collation: { locale: "en", strength: 2 } }
      );
      expect(create).toHaveBeenCalledWith({ legacy: 1 }, { hidden: true });
    });

    it("uses a custom name as the resolved report name", async () => {
      registerFlongoIndexes({
        users: [{ keys: { email: 1 }, options: { name: "email_unique", unique: true } }]
      });
      const reports = await syncFlongoIndexes();
      expect(reports[0].name).toBe("email_unique");
      expect(reports[0].status).toBe("created");
    });
  });

  describe("conflicts", () => {
    it("records conflict and continues under onError warn", async () => {
      const coll = getCollection("users");
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      const reports = await syncFlongoIndexes({ onError: "warn" });

      expect(reports[0].status).toBe("conflict");
      expect(reports[0].error).toMatch(/different options/i);
    });

    it("throws on conflict under onError throw", async () => {
      const coll = getCollection("users");
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      await expect(syncFlongoIndexes({ onError: "throw" })).rejects.toThrow(/conflict/i);
    });
  });

  describe("failures", () => {
    it("records failed (not crash) for a unique index over duplicates under warn", async () => {
      const coll = getCollection("users");
      coll.failCreate("email_1", duplicateKeyError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ onError: "warn" });

      expect(reports[0].status).toBe("failed");
      expect(reports[0].error).toMatch(/duplicate/i);
      expect(reports[0].error).toMatch(/unique index/i);
    });

    it("continues to later collections after a failure under warn", async () => {
      getCollection("users").failCreate("email_1", duplicateKeyError());
      registerFlongoIndexes({
        users: [{ keys: { email: 1 }, options: { unique: true } }],
        stays: [{ keys: { shortlink: 1 } }]
      });

      const reports = await syncFlongoIndexes({ onError: "warn" });

      expect(reports.find((r) => r.collection === "users")?.status).toBe("failed");
      expect(reports.find((r) => r.collection === "stays")?.status).toBe("created");
    });
  });

  describe("modes", () => {
    it("strict throws on failure regardless of onError", async () => {
      getCollection("users").failCreate("email_1", duplicateKeyError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });
      setIndexSyncConfig({ mode: "strict", onError: "warn" });

      await expect(syncFlongoIndexes()).rejects.toThrow(/failed/i);
    });

    it("runBootIndexSync does nothing under mode off", async () => {
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });
      setIndexSyncConfig({ mode: "off" });

      await runBootIndexSync();

      expect(getCollection("users").createIndex).not.toHaveBeenCalled();
    });

    it("runBootIndexSync is a no-op when no indexes are registered", async () => {
      registerFlongoIndexes({});
      setIndexSyncConfig({ mode: "ensure" });
      await expect(runBootIndexSync()).resolves.toBeUndefined();
    });

    it("runBootIndexSync ensures indexes synchronously (non-background)", async () => {
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });
      setIndexSyncConfig({ mode: "ensure" });

      await runBootIndexSync();

      expect(getCollection("users").createIndex).toHaveBeenCalledTimes(1);
    });

    it("background mode does not block boot yet completes the builds", async () => {
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });
      setIndexSyncConfig({ mode: "ensure", background: true });

      await runBootIndexSync();
      // Boot returned; drain the fire-and-forget microtask chain.
      await new Promise((resolve) => setImmediate(resolve));

      expect(getCollection("users").createIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe("pruning", () => {
    it("drops out-of-registry indexes but never _id_", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "stale_1", key: { stale: 1 } });
      coll.indexes.push({ name: "email_1", key: { email: 1 } });

      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      const reports = await syncFlongoIndexes({ prune: true });

      expect(coll.dropIndex).toHaveBeenCalledWith("stale_1");
      expect(coll.dropIndex).not.toHaveBeenCalledWith("_id_");
      expect(coll.dropIndex).not.toHaveBeenCalledWith("email_1");
      expect(reports.find((r) => r.name === "stale_1")?.status).toBe("pruned");
    });

    it("dry-run logs candidates without dropping", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "stale_1", key: { stale: 1 } });
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      const reports = await syncFlongoIndexes({ prune: true, dryRun: true });

      expect(coll.dropIndex).not.toHaveBeenCalled();
      expect(reports.find((r) => r.status === "pruned")).toBeUndefined();
    });

    it("does not prune when prune is off (non-destructive default)", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "stale_1", key: { stale: 1 } });
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      await syncFlongoIndexes();

      expect(coll.dropIndex).not.toHaveBeenCalled();
    });
  });

  describe("reconciling", () => {
    it("drops and rebuilds a conflicting index, reporting reconciled", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ reconcile: true });

      expect(coll.dropIndex).toHaveBeenCalledWith("email_1");
      expect(reports[0].status).toBe("reconciled");
      expect(reports[0].name).toBe("email_1");
      // Rebuilt with the declared options after the drop.
      expect(coll.createIndex).toHaveBeenCalledTimes(2);
      expect(coll.createIndex).toHaveBeenLastCalledWith({ email: 1 }, { unique: true });
    });

    it("honors reconcile from the indexSync config", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });
      setIndexSyncConfig({ reconcile: true });

      const reports = await syncFlongoIndexes();

      expect(reports[0].status).toBe("reconciled");
    });

    it("dry-run logs the candidate without dropping and reports conflict", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, dryRun: true });

      expect(coll.dropIndex).not.toHaveBeenCalled();
      expect(coll.createIndex).toHaveBeenCalledTimes(1);
      expect(reports[0].status).toBe("conflict");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringMatching(/would reconcile index users\.email_1/)
      );
    });

    it("restores the original index when the rebuild fails", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      // First create conflicts; the rebuild after the drop hits duplicates.
      coll.failCreate("email_1", conflictError(), duplicateKeyError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, onError: "warn" });

      expect(reports[0].status).toBe("failed");
      expect(reports[0].error).toMatch(/restored/i);
      // conflict attempt + failed rebuild + restore
      expect(coll.createIndex).toHaveBeenCalledTimes(3);
      expect(coll.createIndex).toHaveBeenLastCalledWith({ email: 1 }, { name: "email_1" });
      const live = await coll.listIndexes().toArray();
      expect(live.map((i: any) => i.name)).toContain("email_1");
    });

    it("reports the double failure when the restore also fails", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", conflictError(), duplicateKeyError(), duplicateKeyError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, onError: "warn" });

      expect(reports[0].status).toBe("failed");
      expect(reports[0].error).toMatch(/restor.*also failed/i);
      expect(reports[0].error).toMatch(/missing this index/i);
      const live = await coll.listIndexes().toArray();
      expect(live.map((i: any) => i.name)).not.toContain("email_1");
    });

    it("drops by the existing index's name when the spec renames it", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_old", key: { email: 1 } });
      coll.failCreate("email_unique", conflictError());
      registerFlongoIndexes({
        users: [{ keys: { email: 1 }, options: { name: "email_unique", unique: true } }]
      });

      const reports = await syncFlongoIndexes({ reconcile: true });

      expect(coll.dropIndex).toHaveBeenCalledWith("email_old");
      expect(reports[0].status).toBe("reconciled");
      expect(reports[0].name).toBe("email_unique");
    });

    it("falls back to conflict when no drop target can be identified", async () => {
      const coll = getCollection("users");
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, onError: "warn" });

      expect(coll.dropIndex).not.toHaveBeenCalled();
      expect(reports[0].status).toBe("conflict");
    });

    it("never reconciles the mandatory _id_ index", async () => {
      const coll = getCollection("users");
      coll.failCreate("_id_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { _id: 1 } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, onError: "warn" });

      expect(coll.dropIndex).not.toHaveBeenCalled();
      expect(reports[0].status).toBe("conflict");
    });

    it("does not reconcile non-conflict failures", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", duplicateKeyError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });

      const reports = await syncFlongoIndexes({ reconcile: true, onError: "warn" });

      expect(coll.dropIndex).not.toHaveBeenCalled();
      expect(reports[0].status).toBe("failed");
    });

    it("a successful reconcile does not throw under strict mode", async () => {
      const coll = getCollection("users");
      coll.indexes.push({ name: "email_1", key: { email: 1 } });
      coll.failCreate("email_1", conflictError());
      registerFlongoIndexes({ users: [{ keys: { email: 1 }, options: { unique: true } }] });
      setIndexSyncConfig({ mode: "strict", reconcile: true });

      const reports = await syncFlongoIndexes();

      expect(reports[0].status).toBe("reconciled");
    });
  });

  describe("report accuracy vs listIndexes", () => {
    it("created indexes are present in listIndexes after sync", async () => {
      registerFlongoIndexes({
        users: [
          { keys: { email: 1 }, options: { unique: true } },
          { keys: { name: 1 } }
        ]
      });

      await syncFlongoIndexes();
      const coll = getCollection("users");
      const live = await coll.listIndexes().toArray();
      const names = live.map((i: any) => i.name);

      expect(names).toContain("email_1");
      expect(names).toContain("name_1");
      expect(names).toContain("_id_");
    });
  });

  describe("missing collection", () => {
    it("treats NamespaceNotFound as no existing indexes and still creates", async () => {
      const coll = getCollection("fresh");
      coll.listIndexes = vi.fn(() => ({
        toArray: vi.fn(async () => {
          const err: any = new Error("ns does not exist");
          err.code = 26;
          throw err;
        })
      })) as any;

      registerFlongoIndexes({ fresh: [{ keys: { email: 1 } }] });
      const reports = await syncFlongoIndexes();

      expect(reports[0].status).toBe("created");
      expect(coll.createIndex).toHaveBeenCalled();
    });
  });
});
