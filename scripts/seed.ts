/** Load the committed sample data (data/sample/*.json) into MongoDB. Safe to re-run (upserts by id). */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import fs from "node:fs";
import { closeDb, ensureIndexes, getDb } from "../lib/db";
import { ReviewSchema } from "../lib/types";
import { RUNS_SNAPSHOT, SNAPSHOT } from "../scraper/store";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Set MONGODB_URI in .env.local first (see .env.example).");
  await ensureIndexes(db);
  const reviews = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")).map((r: unknown) => ReviewSchema.parse(r));
  const res = await db.collection("reviews").bulkWrite(
    reviews.map((r: { id: string }) => ({ updateOne: { filter: { id: r.id }, update: { $set: r }, upsert: true } })),
    { ordered: false },
  );
  const runs = JSON.parse(fs.readFileSync(RUNS_SNAPSHOT, "utf8"));
  if ((await db.collection("scrape_runs").countDocuments()) === 0 && runs.length) {
    await db.collection("scrape_runs").insertMany(runs);
  }
  console.log(`Reviews: ${res.upsertedCount} inserted, ${res.modifiedCount} updated (${reviews.length} in snapshot)`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e.message ?? e);
  await closeDb();
  process.exit(1);
});
