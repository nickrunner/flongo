import { Db, MongoClient } from "mongodb";

export let flongoClient: MongoClient;
export let flongoDb: Db;

export interface FlongoConfig {
  connectionString: string;
  dbName: string;
}

export function initializeFlongo(config: FlongoConfig) {
  flongoClient = new MongoClient(config.connectionString);
  flongoDb = flongoClient.db(config.dbName);
}
