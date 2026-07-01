import { describe, it, expect, beforeEach, vi } from "vitest";

// A single mock collection shared by the mocked MongoClient so the boot-time
// index sync (which routes through flongoDb.collection(name).createIndex) is
// observable from the test.
const mockCollection = {
  createIndex: vi.fn(async (keys: any, options: any = {}) => options.name ?? "mock_idx"),
  dropIndex: vi.fn(),
  listIndexes: vi.fn(() => ({ toArray: vi.fn(async () => [{ name: "_id_", key: { _id: 1 } }]) }))
};

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDb = { collection: vi.fn(() => mockCollection) };

vi.mock("mongodb", async () => {
  const actual: any = await vi.importActual("mongodb");
  return {
    ...actual,
    MongoClient: class {
      connect = mockConnect;
      db = vi.fn(() => mockDb);
    }
  };
});

// Imported after the mock is registered.
import { initializeFlongo, connectFlongo } from "../flongo";
import { getFlongoIndexRegistry, getIndexSyncConfig } from "../indexes";

const baseConfig = {
  connectionString: "mongodb://localhost:27017",
  dbName: "test"
};

describe("flongo init/connect wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("initializeFlongo registers the index registry and sync config", () => {
    const indexes = { users: [{ keys: { email: 1 }, options: { unique: true } }] };
    initializeFlongo({ ...baseConfig, indexes, indexSync: { mode: "ensure", onError: "throw" } });

    expect(getFlongoIndexRegistry()).toEqual(indexes);
    expect(getIndexSyncConfig()).toEqual({ mode: "ensure", onError: "throw" });
  });

  it("initializeFlongo with no indexes clears the registry (purely additive)", () => {
    initializeFlongo({ ...baseConfig, indexes: { users: [{ keys: { email: 1 } }] } });
    initializeFlongo({ ...baseConfig });
    expect(getFlongoIndexRegistry()).toEqual({});
  });

  it("connectFlongo connects and ensures declared indexes at boot", async () => {
    await connectFlongo({
      ...baseConfig,
      indexes: { users: [{ keys: { email: 1 }, options: { unique: true } }] },
      indexSync: { mode: "ensure" }
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCollection.createIndex).toHaveBeenCalledWith({ email: 1 }, { unique: true });
  });

  it("connectFlongo does not touch indexes when none are declared", async () => {
    await connectFlongo({ ...baseConfig });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCollection.createIndex).not.toHaveBeenCalled();
  });

  it("connectFlongo skips index sync under mode off", async () => {
    await connectFlongo({
      ...baseConfig,
      indexes: { users: [{ keys: { email: 1 } }] },
      indexSync: { mode: "off" }
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCollection.createIndex).not.toHaveBeenCalled();
  });
});
