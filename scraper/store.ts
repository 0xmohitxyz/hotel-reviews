import fs from "node:fs";
import path from "node:path";
import { ensureIndexes, getDb } from "../lib/db";
import type { Review, ScrapeRun } from "../lib/types";

export const SNAPSHOT = path.join(process.cwd(), "data", "sample", "reviews.json");
export const RUNS_SNAPSHOT = path.join(process.cwd(), "data", "sample", "scrape-runs.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file); // atomic replace: never leaves a half-written file
}

/** IDs we already have for a property (used to stop paging early). */
export async function knownIds(propertyId: string): Promise<Set<string>> {
  const db = await getDb();
  if (db) {
    const docs = await db
      .collection("reviews")
      .find({ propertyId }, { projection: { id: 1, _id: 0 } })
      .toArray();
    return new Set(docs.map((d) => d.id as string));
  }
  return new Set(
    readJson<Review[]>(SNAPSHOT, []).filter((r) => r.propertyId === propertyId).map((r) => r.id),
  );
}

/**
 * Upsert reviews by their unique id. Existing reviews keep firstSeenAt and
 * get refreshed fields (e.g. a hotel reply added later). Returns counts.
 */
export async function saveReviews(reviews: Review[]) {
  let inserted = 0;
  let updated = 0;

  // 1) JSON snapshot (always): the committed sample data and offline fallback.
  const byId = new Map(readJson<Review[]>(SNAPSHOT, []).map((r) => [r.id, r]));
  for (const r of reviews) {
    const prev = byId.get(r.id);
    if (!prev) inserted++;
    else if (JSON.stringify(prev) !== JSON.stringify({ ...r, firstSeenAt: prev.firstSeenAt })) updated++;
    byId.set(r.id, prev ? { ...r, firstSeenAt: prev.firstSeenAt } : r);
  }
  const all = [...byId.values()].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  writeJson(SNAPSHOT, all);

  // 2) MongoDB (when configured): the unique index on `id` guarantees no duplicates.
  const db = await getDb();
  if (db && reviews.length) {
    await ensureIndexes(db);
    const res = await db.collection("reviews").bulkWrite(
      reviews.map((r) => {
        const { firstSeenAt, ...rest } = r;
        return {
          updateOne: {
            filter: { id: r.id },
            update: { $set: rest, $setOnInsert: { firstSeenAt } },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
    inserted = res.upsertedCount;
    updated = res.modifiedCount;
  }
  return { inserted, updated };
}

export async function logRun(run: ScrapeRun) {
  const runs = readJson<ScrapeRun[]>(RUNS_SNAPSHOT, []);
  writeJson(RUNS_SNAPSHOT, [run, ...runs].slice(0, 100));
  const db = await getDb();
  if (db) await db.collection("scrape_runs").insertOne({ ...run });
}
