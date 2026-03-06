import { Db, MongoClient, MongoClientOptions } from "mongodb";

export let flongoClient: MongoClient;
export let flongoDb: Db;

export interface FlongoConfig {
  connectionString: string;
  dbName: string;
  clientOptions?: MongoClientOptions;
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
}

export async function connectFlongo(config: FlongoConfig) {
  initializeFlongo(config);
  await flongoClient.connect();
}
