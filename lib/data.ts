import fs from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { classify } from "./classify";
import { getDb } from "./db";
import type { ClassifiedReview, Review, ScrapeRun } from "./types";

const SAMPLE = path.join(process.cwd(), "data", "sample");

/**
 * All reviews, classified. Reads MongoDB when MONGODB_URI is set, otherwise
 * the committed JSON snapshot. The dataset is small (hundreds of reviews),
 * so filtering and metrics run in memory and stay easy to test.
 * Cached for an hour: reviews only change when the scraper runs.
 */
export async function getReviews(): Promise<ClassifiedReview[]> {
  "use cache";
  cacheLife("hours");
  let rows: Review[];
  const db = await getDb().catch(() => null);
  if (db) {
    rows = await db
      .collection<Review>("reviews")
      .find({}, { projection: { _id: 0 } })
      .sort({ reviewedAt: -1 })
      .toArray();
  } else {
    rows = JSON.parse(await fs.readFile(path.join(SAMPLE, "reviews.json"), "utf8").catch(() => "[]"));
  }
  return rows.map(classify);
}

export async function getRecentRuns(): Promise<ScrapeRun[]> {
  "use cache";
  cacheLife("hours");
  const db = await getDb().catch(() => null);
  if (db) {
    return db
      .collection<ScrapeRun>("scrape_runs")
      .find({}, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .limit(20)
      .toArray();
  }
  return JSON.parse(await fs.readFile(path.join(SAMPLE, "scrape-runs.json"), "utf8").catch(() => "[]"));
}
