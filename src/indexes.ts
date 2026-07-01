import { CollationOptions, Collection, Document } from "mongodb";
import { flongoDb } from "./flongo";

/**
 * The value of a single key in an index specification.
 * - `1` / `-1` — ascending / descending B-tree key.
 * - `"2dsphere"` — geospatial index (GeoJSON).
 * - `"text"` — full-text index.
 * - `"hashed"` — hashed index (e.g. for hashed sharding).
 */
export type FlongoIndexKeyType = 1 | -1 | "2dsphere" | "text" | "hashed";

/**
 * Options for a declared index. Mirrors the subset of the MongoDB driver's
 * `CreateIndexesOptions` that Flongo supports declaratively. Any option here is
 * passed through to `createIndex` verbatim.
 */
export interface FlongoIndexOptions {
  /** Custom index name. Defaults to MongoDB's generated `field_direction` name. */
  name?: string;
  /** Enforce uniqueness across the indexed key(s). */
  unique?: boolean;
  /** Only index documents that contain the indexed field(s). */
  sparse?: boolean;
  /**
   * Only index documents matching this filter (partial index). Useful for
   * "unique when present" constraints and for indexing a subset of documents
   * (e.g. only analytics events).
   */
  partialFilterExpression?: Document;
  /**
   * TTL: seconds after which a document expires. **Requires the indexed field
   * to be a BSON `Date`.** Flongo stamps `createdAt`/`updatedAt` as epoch
   * numbers, so a TTL index on those fields will not expire anything — index a
   * dedicated `Date`-typed field instead. See the README TTL caveat.
   */
  expireAfterSeconds?: number;
  /** Collation (locale-aware comparison) for the index. */
  collation?: CollationOptions;
  /** Hide the index from the query planner without dropping it. */
  hidden?: boolean;
}

/**
 * A declarative, idempotent index specification. Declared once in the registry
 * and ensured on every boot via {@link syncFlongoIndexes}.
 */
export interface FlongoIndexSpec {
  /** The index key map. Keys are (dot-path) field names; values are key types. */
  keys: Record<string, FlongoIndexKeyType>;
  /** Optional index options (unique, sparse, TTL, collation, etc.). */
  options?: FlongoIndexOptions;
}

/**
 * The index registry: a map of collection name → declared index specs. A single
 * central registry (rather than per-`FlongoCollection`-construction specs) is
 * the source of truth, since one physical collection is frequently constructed
 * in many places and per-construction specs would duplicate and conflict.
 */
export type FlongoIndexRegistry = Record<string, FlongoIndexSpec[]>;

/**
 * Boot-time sync behavior.
 * - `"ensure"` (default) — create missing indexes; tolerate conflicts/failures
 *   per `onError`.
 * - `"off"` — register specs but do nothing at boot; the app calls
 *   {@link syncFlongoIndexes} itself.
 * - `"strict"` — throw on any conflict or failure (for CI / migration gates).
 */
export type IndexSyncMode = "ensure" | "off" | "strict";

/** How a non-fatal sync problem is surfaced: log and continue, or throw. */
export type IndexSyncOnError = "warn" | "throw";

/**
 * Configuration for boot-time index sync, supplied via `initializeFlongo`'s
 * `indexSync` field.
 */
export interface IndexSyncOptions {
  /** Sync mode. Defaults to `"ensure"`. */
  mode?: IndexSyncMode;
  /** Error handling for non-strict modes. Defaults to `"warn"`. */
  onError?: IndexSyncOnError;
  /**
   * When `true`, boot does not block on index builds — the sync is kicked off
   * asynchronously and its outcome is logged on completion. `await
   * syncFlongoIndexes()` remains available when the app wants to await. Defaults
   * to `false` (await index builds during `connectFlongo`).
   */
  background?: boolean;
  /**
   * When `true`, drop indexes that exist in Mongo but are absent from the
   * registry (never `_id_`). Opt-in and off by default. See also `dryRun`.
   */
  prune?: boolean;
  /**
   * When `true`, resolve index conflicts (an index with the same identity
   * already exists with different options or keys) by dropping the existing
   * index and rebuilding it from the declared spec. If the rebuild fails, the
   * original index is restored from the pre-sync snapshot so the collection is
   * never left without it. Note the rebuild window: while the index is being
   * rebuilt, queries can't use it and `unique` is not enforced. Opt-in and off
   * by default; never touches `_id_`. See also `dryRun`.
   */
  reconcile?: boolean;
  /**
   * When pruning or reconciling, log the indexes that *would* be dropped (or
   * dropped and rebuilt) without touching them. Off by default.
   */
  dryRun?: boolean;
}

/** The outcome of ensuring (or pruning/reconciling) a single index. */
export type FlongoIndexStatus =
  | "created"
  | "exists"
  | "conflict"
  | "failed"
  | "pruned"
  | "reconciled";

/** A structured, per-index result from {@link syncFlongoIndexes}. */
export interface FlongoIndexReport {
  /** Collection the index belongs to. */
  collection: string;
  /** Resolved index name. */
  name: string;
  /** What happened to this index during the sync. */
  status: FlongoIndexStatus;
  /** Error/diagnostic message when `status` is `"conflict"` or `"failed"`. */
  error?: string;
}

/** Per-call overrides for {@link syncFlongoIndexes}. */
export interface SyncFlongoIndexesOptions {
  /** Override the configured sync mode. */
  mode?: IndexSyncMode;
  /** Override the configured error handling. */
  onError?: IndexSyncOnError;
  /** Drop out-of-registry indexes (never `_id_`). */
  prune?: boolean;
  /** Drop + rebuild conflicting indexes from their declared specs (never `_id_`). */
  reconcile?: boolean;
  /** With `prune`/`reconcile`, log candidates without dropping. */
  dryRun?: boolean;
}

// ===========================================
// REGISTRY STATE
// ===========================================

let indexRegistry: FlongoIndexRegistry = {};
let indexSyncConfig: IndexSyncOptions = {};

/**
 * Registers the declarative index registry. Called by `initializeFlongo`; a
 * missing registry clears any previously registered specs.
 */
export function registerFlongoIndexes(registry?: FlongoIndexRegistry): void {
  indexRegistry = registry ?? {};
}

/** Registers boot-time index sync configuration. Called by `initializeFlongo`. */
export function setIndexSyncConfig(config?: IndexSyncOptions): void {
  indexSyncConfig = config ?? {};
}

/** Returns the currently registered index registry. */
export function getFlongoIndexRegistry(): FlongoIndexRegistry {
  return indexRegistry;
}

/** Returns the currently registered index sync configuration. */
export function getIndexSyncConfig(): IndexSyncOptions {
  return indexSyncConfig;
}

// ===========================================
// HELPERS
// ===========================================

/**
 * Computes the index name MongoDB would generate for a key map, matching the
 * driver's `field_direction` join (e.g. `{ a: 1, "b.c": -1 }` → `a_1_b.c_-1`,
 * `{ loc: "2dsphere" }` → `loc_2dsphere`). Used to resolve report names and to
 * match declared specs against existing indexes without a round-trip.
 */
export function defaultIndexName(keys: Record<string, FlongoIndexKeyType>): string {
  return Object.entries(keys)
    .map(([field, type]) => `${field}_${type}`)
    .join("_");
}

/** Resolves a spec's effective index name (explicit `name` or the default). */
function resolveIndexName(spec: FlongoIndexSpec): string {
  return spec.options?.name ?? defaultIndexName(spec.keys);
}

/**
 * Lists a collection's existing indexes, treating a missing collection (which
 * has no indexes yet) as an empty list rather than an error.
 */
async function fetchExistingIndexes(collection: Collection): Promise<Document[]> {
  try {
    return await collection.listIndexes().toArray();
  } catch (err: any) {
    // NamespaceNotFound (code 26): the collection doesn't exist yet, so it has
    // no indexes. Any create below will lazily create the collection.
    if (err?.code === 26 || /ns does not exist/i.test(err?.message ?? "")) {
      return [];
    }
    throw err;
  }
}

/**
 * Whether an error from `createIndex` represents an index *conflict* — the same
 * name or key pattern already exists with different options — as opposed to a
 * genuine creation failure.
 */
function isConflictError(err: any): boolean {
  const code = err?.code;
  const codeName = err?.codeName ?? "";
  return (
    code === 85 || // IndexOptionsConflict
    code === 86 || // IndexKeySpecsConflict
    codeName === "IndexOptionsConflict" ||
    codeName === "IndexKeySpecsConflict" ||
    /already exists with different|different options/i.test(err?.message ?? "")
  );
}

/**
 * Produces a diagnostic message for a failed index build, naming the likely
 * cause for the classic case of a unique index over existing duplicates.
 */
function describeFailure(err: any): string {
  const base = err?.message ?? String(err);
  if (err?.code === 11000 || /duplicate key|E11000/i.test(base)) {
    return `${base} — likely cause: a unique index cannot be built because the collection already contains duplicate values for the indexed key(s). Resolve the duplicates or drop the \`unique\` option.`;
  }
  return base;
}

/** Order-sensitive equality between an existing index's key doc and a spec's keys. */
function sameKeyPattern(
  existingKey: Document,
  specKeys: Record<string, FlongoIndexKeyType>
): boolean {
  const a = Object.entries(existingKey ?? {});
  const b = Object.entries(specKeys);
  return a.length === b.length && a.every(([field, type], i) => b[i][0] === field && b[i][1] === type);
}

/**
 * Finds the existing index a conflicting spec collides with: same resolved
 * name, or (for an explicitly renamed spec) the same key pattern under another
 * name. The server-side index is the identity that must be dropped to
 * reconcile — not the spec's resolved name, which may not exist yet.
 */
function findConflictingIndex(
  existing: Document[],
  spec: FlongoIndexSpec
): Document | undefined {
  const name = resolveIndexName(spec);
  return (
    existing.find((i) => i.name === name) ??
    existing.find((i) => sameKeyPattern(i.key as Document, spec.keys))
  );
}

/**
 * Rebuilds `createIndex` options from a `listIndexes` document so a dropped
 * index can be restored verbatim, minus the server-managed fields that
 * `createIndex` does not accept back.
 */
function restoreOptionsFromIndexDoc(doc: Document): Document {
  const options: Document = {};
  for (const [field, value] of Object.entries(doc)) {
    if (field !== "v" && field !== "key" && field !== "ns" && field !== "background") {
      options[field] = value;
    }
  }
  return options;
}

/**
 * Attempts to reconcile a conflicting spec by dropping the existing index and
 * rebuilding it from the declaration. If the rebuild fails, the original index
 * is restored from the pre-sync snapshot so the collection is never left
 * without it. Returns the report for the attempt, or `undefined` when there is
 * no safely identifiable drop target (or the target is `_id_`, or this is a
 * dry run), in which case the caller falls back to plain conflict handling.
 */
async function reconcileIndex(
  collection: Collection,
  collectionName: string,
  spec: FlongoIndexSpec,
  existing: Document[],
  dryRun: boolean
): Promise<FlongoIndexReport | undefined> {
  const target = findConflictingIndex(existing, spec);
  if (!target || target.name === "_id_") {
    return undefined;
  }
  const targetName = target.name as string;
  const resolvedName = resolveIndexName(spec);

  if (dryRun) {
    console.warn(
      `[flongo] [dry-run] would reconcile index ${collectionName}.${targetName} (drop + rebuild as ${resolvedName})`
    );
    return undefined;
  }

  try {
    await collection.dropIndex(targetName);
  } catch (err: any) {
    return {
      collection: collectionName,
      name: targetName,
      status: "failed",
      error: `reconcile could not drop existing index: ${err?.message ?? String(err)}`
    };
  }

  try {
    const createdName = await collection.createIndex(
      spec.keys as any,
      (spec.options ?? {}) as any
    );
    console.warn(
      `[flongo] Reconciled index ${collectionName}.${createdName ?? resolvedName} (dropped ${targetName}, rebuilt with declared options)`
    );
    return {
      collection: collectionName,
      name: createdName ?? resolvedName,
      status: "reconciled"
    };
  } catch (err: any) {
    const rebuildFailure = describeFailure(err);
    // The old index is already gone; restore it rather than leaving the
    // collection with no index at all.
    try {
      await collection.createIndex(target.key as any, restoreOptionsFromIndexDoc(target) as any);
      return {
        collection: collectionName,
        name: resolvedName,
        status: "failed",
        error: `reconcile rebuild failed; original index ${targetName} was restored — ${rebuildFailure}`
      };
    } catch (restoreErr: any) {
      return {
        collection: collectionName,
        name: resolvedName,
        status: "failed",
        error: `reconcile rebuild failed and restoring ${targetName} also failed — the collection is currently missing this index. Rebuild: ${rebuildFailure}; restore: ${restoreErr?.message ?? String(restoreErr)}`
      };
    }
  }
}

/** Logs a one-line summary of a sync run, grouped by status. */
function logSummary(reports: FlongoIndexReport[]): void {
  const counts: Record<string, number> = {};
  for (const r of reports) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([status, n]) => `${n} ${status}`)
    .join(", ");
  console.log(`[flongo] Index sync complete: ${summary || "no indexes declared"}`);
}

// ===========================================
// SYNC
// ===========================================

/**
 * Idempotently ensures every index in the registry exists, returning a
 * structured report. Safe to run on every boot.
 *
 * For each spec, calls `createIndex(keys, options)`:
 * - identical spec already present → `"exists"` (no-op);
 * - same keys with different options → Mongo throws a conflict, recorded as
 *   `"conflict"` (never silently dropped/recreated) — unless `reconcile` is on,
 *   in which case the existing index is dropped and rebuilt from the spec
 *   (`"reconciled"`), with the original restored if the rebuild fails;
 * - other creation errors (e.g. a unique index over existing duplicates) →
 *   `"failed"` with a diagnostic message.
 *
 * `mode`/`onError` are read from the `indexSync` config unless overridden here.
 * `strict` mode forces `onError: "throw"`. With `prune`, indexes present in
 * Mongo but absent from the registry are dropped (never `_id_`); `dryRun` logs
 * prune/reconcile candidates without dropping.
 *
 * @param opts - Per-call overrides for mode, onError, prune, reconcile, and dryRun.
 * @returns One {@link FlongoIndexReport} per ensured (and pruned) index.
 */
export async function syncFlongoIndexes(
  opts: SyncFlongoIndexesOptions = {}
): Promise<FlongoIndexReport[]> {
  const cfg = getIndexSyncConfig();
  const mode: IndexSyncMode = opts.mode ?? cfg.mode ?? "ensure";
  const prune = opts.prune ?? cfg.prune ?? false;
  const reconcile = opts.reconcile ?? cfg.reconcile ?? false;
  const dryRun = opts.dryRun ?? cfg.dryRun ?? false;
  // Strict mode always throws; otherwise honor the configured/overridden policy.
  const onError: IndexSyncOnError =
    mode === "strict" ? "throw" : opts.onError ?? cfg.onError ?? "warn";

  const registry = getFlongoIndexRegistry();
  const reports: FlongoIndexReport[] = [];

  const raise = (status: FlongoIndexStatus, collection: string, name: string, message: string) => {
    if (onError === "throw") {
      throw new Error(`[flongo] Index sync ${status} for ${collection}.${name}: ${message}`);
    }
    console.warn(`[flongo] Index sync ${status} for ${collection}.${name}: ${message}`);
  };

  for (const [collectionName, specs] of Object.entries(registry)) {
    const collection = flongoDb.collection(collectionName);
    // Snapshot the pre-existing indexes once: used both to classify
    // created-vs-exists and to decide pruning (so we never prune what we just
    // created this run).
    const existing = await fetchExistingIndexes(collection);
    const existingNames = new Set(existing.map((i) => i.name as string));

    for (const spec of specs) {
      const resolvedName = resolveIndexName(spec);
      const preExists = existingNames.has(resolvedName);
      try {
        const createdName = await collection.createIndex(
          spec.keys as any,
          (spec.options ?? {}) as any
        );
        reports.push({
          collection: collectionName,
          name: createdName ?? resolvedName,
          status: preExists ? "exists" : "created"
        });
      } catch (err: any) {
        const conflict = isConflictError(err);
        if (conflict && reconcile) {
          const report = await reconcileIndex(collection, collectionName, spec, existing, dryRun);
          if (report) {
            reports.push(report);
            if (report.status === "failed") {
              raise("failed", collectionName, report.name, report.error ?? "reconcile failed");
            }
            continue;
          }
          // No safe drop target (or dry run): fall through to plain conflict handling.
        }
        const status: FlongoIndexStatus = conflict ? "conflict" : "failed";
        const message = conflict
          ? err?.message ?? "index options conflict"
          : describeFailure(err);
        reports.push({ collection: collectionName, name: resolvedName, status, error: message });
        raise(status, collectionName, resolvedName, message);
      }
    }

    if (prune) {
      const declaredNames = new Set(specs.map((s) => resolveIndexName(s)));
      for (const idx of existing) {
        const name = idx.name as string;
        // Never drop the mandatory _id index, and never drop a declared one.
        if (name === "_id_" || declaredNames.has(name)) {
          continue;
        }
        if (dryRun) {
          console.warn(`[flongo] [dry-run] would prune index ${collectionName}.${name}`);
          continue;
        }
        try {
          await collection.dropIndex(name);
          reports.push({ collection: collectionName, name, status: "pruned" });
          console.warn(`[flongo] Pruned out-of-registry index ${collectionName}.${name}`);
        } catch (err: any) {
          const message = describeFailure(err);
          reports.push({ collection: collectionName, name, status: "failed", error: message });
          raise("failed", collectionName, name, message);
        }
      }
    }
  }

  logSummary(reports);
  return reports;
}

/**
 * Boot-time entry point invoked by `connectFlongo` after the connection is
 * established. Respects `indexSync.mode` (`"off"` does nothing) and
 * `indexSync.background` (kick off async and log on completion rather than
 * blocking boot). A no-op when no indexes are registered.
 */
export async function runBootIndexSync(): Promise<void> {
  const cfg = getIndexSyncConfig();
  const mode: IndexSyncMode = cfg.mode ?? "ensure";
  if (mode === "off") {
    return;
  }
  if (Object.keys(getFlongoIndexRegistry()).length === 0) {
    return;
  }

  if (cfg.background) {
    // Don't block boot; report the outcome when the builds finish. Errors are
    // logged rather than propagated because there is no boot to fail here.
    void syncFlongoIndexes()
      .then((reports) => {
        const failures = reports.filter((r) => r.status === "failed" || r.status === "conflict");
        if (failures.length) {
          console.warn(
            `[flongo] Background index sync finished with ${failures.length} problem(s).`
          );
        }
      })
      .catch((err) => {
        console.error("[flongo] Background index sync failed:", err);
      });
    return;
  }

  await syncFlongoIndexes();
}
