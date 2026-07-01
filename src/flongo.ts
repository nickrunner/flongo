import { Db, MongoClient, MongoClientOptions } from "mongodb";
import {
  FlongoIndexRegistry,
  IndexSyncOptions,
  registerFlongoIndexes,
  runBootIndexSync,
  setIndexSyncConfig
} from "./indexes";

export let flongoClient: MongoClient;
export let flongoDb: Db;

export interface FlongoConfig {
  connectionString: string;
  dbName: string;
  clientOptions?: MongoClientOptions;
  /**
   * Declarative index registry keyed by collection name. Indexes declared here
   * are ensured at boot by `connectFlongo` (see `indexSync`) and can be
   * re-applied any time via `syncFlongoIndexes()`. Omit for identical behavior
   * to previous versions — index management is purely additive.
   */
  indexes?: FlongoIndexRegistry;
  /** Boot-time index sync behavior (mode, error handling, background, prune). */
  indexSync?: IndexSyncOptions;
}

const defaultClientOptions: MongoClientOptions = {
  serverSelectionTimeoutMS: 10000,
  heartbeatFrequencyMS: 15000,
  socketTimeoutMS: 30000,
  maxIdleTimeMS: 60000,
};

export function initializeFlongo(config: FlongoConfig) {
  const options = { ...defaultClientOptions, ...config.clientOptions };
  flongoClient = new MongoClient(config.connectionString, options);
  flongoDb = flongoClient.db(config.dbName);
  // Register declarative index specs so `syncFlongoIndexes()` / boot sync can
  // find them. Registration is synchronous and connection-independent.
  registerFlongoIndexes(config.indexes);
  setIndexSyncConfig(config.indexSync);
}

export async function connectFlongo(config: FlongoConfig) {
  initializeFlongo(config);
  await flongoClient.connect();
  // Ensure declared indexes once connected. Honors indexSync.mode/background;
  // a no-op when no indexes are registered, so existing callers are unaffected.
  await runBootIndexSync();
}
