import { MongoClient, type Db } from "mongodb";

/**
 * Shared MongoDB client. Reused across hot reloads in dev and across
 * invocations of the same serverless instance in production.
 * Returns null when MONGODB_URI is not configured: callers then fall back
 * to the JSON snapshot in data/sample/.
 */
const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!g._mongo) {
    g._mongo = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      appName: "review-insights",
    }).connect();
    g._mongo.catch(() => (g._mongo = undefined)); // allow retry after a failed connect
  }
  const client = await g._mongo;
  return client.db(process.env.MONGODB_DB || "review_insights");
}

export async function closeDb() {
  if (g._mongo) {
    const c = await g._mongo;
    g._mongo = undefined;
    await c.close();
  }
}

export async function ensureIndexes(db: Db) {
  await db.collection("reviews").createIndexes([
    { key: { id: 1 }, name: "uniq_review_id", unique: true },
    { key: { propertyId: 1, reviewedAt: -1 }, name: "property_date" },
  ]);
  await db.collection("scrape_runs").createIndex({ startedAt: -1 });
}
