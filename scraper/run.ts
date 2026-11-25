/**
 * Booking.com review collector.
 *
 * Opens each property's public page in headless Chromium, like a normal
 * visitor: opens "Read all reviews", sorts by "Newest first" and clicks
 * "Next page". It reads the review data the page itself loads (the
 * `ReviewList` JSON response), and falls back to reading the rendered review
 * cards if that JSON is not available.
 *
 *   npm run scrape                      # incremental, all properties
 *   npm run scrape -- --full            # ignore known reviews, page to the end
 *   npm run scrape -- --property=paddington
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page, type Response } from "playwright";
import { closeDb } from "../lib/db";
import { PROPERTIES, type Property } from "../lib/properties";
import { ReviewSchema, type Review, type ScrapeRun } from "../lib/types";
import { knownIds, logRun, saveReviews } from "./store";

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const ONLY = args.find((a) => a.startsWith("--property="))?.split("=")[1];
const MAX_PAGES = Number(process.env.SCRAPE_MAX_PAGES || 40);
const ATTEMPTS = 3;

const SEL = {
  cookieReject: "#onetrust-reject-all-handler",
  readAll: 'button:has-text("Read all reviews")',
  list: '[data-testid="review-list-container"]',
  sorter: 'select[data-testid="reviews-sorter-component"]',
  card: '[data-testid="review-card"]',
  next: 'button[aria-label="Next page"]',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(1500 + Math.random() * 1500); // be polite: 1.5–3s between actions
const log = (p: Property, msg: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${p.id.padEnd(16)} ${msg}`);

// ---------- parsing ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromJson(card: any, propertyId: string, now: string): unknown {
  const t = card.textDetails ?? {};
  const g = card.guestDetails ?? {};
  const b = card.bookingDetails ?? {};
  return {
    id: card.reviewUrl,
    propertyId,
    score: card.reviewScore,
    reviewedAt: new Date(card.reviewedDate * 1000).toISOString(),
    title: t.title ?? "",
    liked: t.positiveText ?? "",
    disliked: t.negativeText ?? "",
    lang: t.lang ?? null,
    guestName: g.anonymous ? null : (g.username ?? null),
    country: g.countryName ?? null,
    travellerType: g.guestTypeTranslation ?? null,
    room: b.roomType?.name ?? null,
    nights: b.numNights ?? null,
    checkIn: b.checkinDate ?? null,
    checkOut: b.checkoutDate ?? null,
    hotelReply: card.partnerReply?.reply ?? null,
    helpfulVotes: card.helpfulVotesCount ?? 0,
    source: "json",
    firstSeenAt: now,
  };
}

/** Fallback: read the visible review cards via their data-testid attributes. */
async function fromDom(page: Page, propertyId: string, now: string): Promise<unknown[]> {
  const raw = await page.$$eval(SEL.card, (cards) =>
    cards.map((c) => {
      const q = (id: string) =>
        (c.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText?.trim() ?? "";
      return {
        name: q("review-avatar"),
        room: q("review-room-name"),
        nights: q("review-num-nights"),
        traveller: q("review-traveler-type"),
        date: q("review-date"),
        title: q("review-title"),
        score: q("review-score"),
        liked: q("review-positive-text"),
        disliked: q("review-negative-text"),
      };
    }),
  );
  return raw.map((r) => {
    const reviewed = new Date(r.date.replace(/^Reviewed:\s*/i, "") + " 12:00 UTC");
    const [guestName, ...country] = r.name.split("\n");
    const id =
      "h_" +
      crypto
        .createHash("sha256")
        .update([propertyId, r.date, guestName, r.title, r.liked, r.disliked].join("|"))
        .digest("hex")
        .slice(0, 16);
    return {
      id,
      propertyId,
      score: Number(r.score.match(/(\d+(?:\.\d+)?)/)?.[1]),
      reviewedAt: isNaN(+reviewed) ? "" : reviewed.toISOString(),
      title: r.title,
      liked: r.liked,
      disliked: r.disliked,
      lang: null,
      guestName: guestName || null,
      country: country.join(" ").trim() || null,
      travellerType: r.traveller || null,
      room: r.room || null,
      nights: Number(r.nights.match(/\d+/)?.[0]) || null,
      checkIn: null,
      checkOut: null,
      hotelReply: null,
      helpfulVotes: 0,
      source: "dom",
      firstSeenAt: now,
    };
  });
}

// ---------- browser flow ----------

const isReviewList = (res: Response) =>
  res.url().includes("/dml/graphql") &&
  (res.request().postData() ?? "").includes('"ReviewList"') &&
  (res.request().postData() ?? "").includes("NEWEST_FIRST");

/** Run an action and wait for the ReviewList JSON it triggers (or null on timeout). */
async function actAndCapture(page: Page, action: () => Promise<unknown>) {
  const wait = page.waitForResponse(isReviewList, { timeout: 20000 }).catch(() => null);
  await action();
  const res = await wait;
  if (!res || !res.ok()) return null;
  try {
    const body = await res.json();
    return body?.data?.reviewListFrontend ?? null;
  } catch {
    return null;
  }
}

async function scrapeProperty(page: Page, p: Property, known: Set<string>) {
  const now = new Date().toISOString();
  const collected = new Map<string, Review>();
  let invalid = 0;
  let pages = 0;
  let listed: number | null = null;
  let usedDom = false;

  await page.goto(`https://www.booking.com/hotel/au/${p.slug}.en-gb.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator(SEL.cookieReject).click({ timeout: 8000 }).catch(() => {});
  await page.locator(SEL.readAll).first().click({ timeout: 30000 });
  await page.locator(SEL.list).waitFor({ timeout: 30000 });

  let data = await actAndCapture(page, () =>
    page.selectOption(SEL.sorter, { label: "Newest first" }),
  );

  while (pages < MAX_PAGES) {
    pages++;
    await page.locator(SEL.card).first().waitFor({ timeout: 20000 });
    let rawCards: unknown[];
    if (data?.reviewCard) {
      listed = data.reviewsCount ?? listed;
      rawCards = data.reviewCard.map((c: any) => fromJson(c, p.id, now));
    } else {
      usedDom = true;
      rawCards = await fromDom(page, p.id, now);
    }

    let newOnPage = 0;
    for (const raw of rawCards) {
      const parsed = ReviewSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.reviewedAt) {
        invalid++;
        continue;
      }
      if (!known.has(parsed.data.id)) newOnPage++;
      collected.set(parsed.data.id, parsed.data);
    }
    log(p, `page ${pages}: ${rawCards.length} reviews (${newOnPage} new)${data ? "" : " [DOM fallback]"}`);

    // Incremental mode: newest-first, so a page with nothing new means we're caught up.
    if (!FULL && rawCards.length > 0 && newOnPage === 0) break;

    const next = page.locator(SEL.next).first();
    if (!(await next.isVisible().catch(() => false)) || !(await next.isEnabled().catch(() => false))) break;
    await jitter();
    data = await actAndCapture(page, () => next.click());
  }

  return { reviews: [...collected.values()], invalid, pages, listed, usedDom };
}

async function main() {
  const targets = PROPERTIES.filter((p) => !ONLY || p.id === ONLY);
  if (!targets.length) throw new Error(`Unknown property "${ONLY}"`);
  console.log(`Mode: ${FULL ? "full backfill" : "incremental"} · DB: ${process.env.MONGODB_URI ? "MongoDB" : "JSON snapshot only"}`);

  // BROWSER_CHANNEL=msedge uses the Edge already installed on Windows (no download needed).
  const browser = await chromium.launch({
    // Booking.com serves an empty review list to headless browsers, so we run a normal
    // (headed) browser. On Linux CI this runs inside a virtual display (xvfb-run).
    headless: process.env.HEADLESS === "1",
    channel: process.env.BROWSER_CHANNEL || undefined,
  });
  let failures = 0;

  for (const p of targets) {
    const startedAt = new Date().toISOString();
    const known = FULL ? new Set<string>() : await knownIds(p.id);
    let run: ScrapeRun | null = null;

    for (let attempt = 1; attempt <= ATTEMPTS && !run; attempt++) {
      const context = await browser.newContext({
        locale: "en-GB",
        timezoneId: "Australia/Sydney",
        viewport: { width: 1366, height: 900 },
      });
      const page = await context.newPage();
      try {
        const r = await scrapeProperty(page, p, known);
        const { inserted, updated } = await saveReviews(r.reviews);
        const seen = r.reviews.length + r.invalid;
        // Change detection: no valid reviews or >20% invalid means the page layout probably changed.
        const degraded = r.reviews.length === 0 || r.invalid / Math.max(seen, 1) > 0.2 || r.usedDom;
        if (degraded) await dumpDebug(page, p);
        run = {
          propertyId: p.id, startedAt, finishedAt: new Date().toISOString(),
          status: degraded ? "degraded" : "ok", pages: r.pages, seen,
          inserted, updated, invalid: r.invalid, listedOnBooking: r.listed,
          message: r.usedDom ? "Used DOM fallback (review JSON not captured)" : r.reviews.length === 0 ? "No reviews parsed" : null,
        };
        log(p, `done: ${inserted} new, ${updated} updated, ${r.invalid} invalid, ${r.pages} pages (${run.status})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        log(p, `attempt ${attempt}/${ATTEMPTS} failed: ${msg}`);
        if (attempt === ATTEMPTS) {
          await dumpDebug(page, p);
          run = {
            propertyId: p.id, startedAt, finishedAt: new Date().toISOString(), status: "failed",
            pages: 0, seen: 0, inserted: 0, updated: 0, invalid: 0, listedOnBooking: null, message: msg,
          };
        } else {
          await sleep(5000 * 2 ** (attempt - 1)); // exponential backoff: 5s, 10s
        }
      } finally {
        await context.close();
      }
    }
    if (run!.status === "failed") failures++;
    await logRun(run!);
    await jitter();
  }

  await browser.close();
  await closeDb();
  // Non-zero exit only if every property failed, so CI flags a real outage.
  if (failures === targets.length) process.exit(1);
}

async function dumpDebug(page: Page, p: Property) {
  try {
    const dir = path.join(process.cwd(), "data", "debug");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(dir, `${p.id}-${stamp}.html`), await page.content());
    await page.screenshot({ path: path.join(dir, `${p.id}-${stamp}.png`), fullPage: false });
  } catch {
    /* page may already be closed */
  }
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
