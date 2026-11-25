import assert from "node:assert/strict";
import { describe, it } from "node:test";
const has = (arr: unknown[], v: unknown) => assert.ok(arr.some((x) => JSON.stringify(x) === JSON.stringify(v)), JSON.stringify(v));
import { classify, isEmptyComplaint, sentimentFor, topicsFor } from "../lib/classify";
import { resolveRange, weekStart } from "../lib/metrics";
import type { Review } from "../lib/types";

const review = (over: Partial<Review>): Review => ({
  id: "x", propertyId: "paddington", score: 5, reviewedAt: "2026-11-24T00:00:00Z", title: "", liked: "", disliked: "",
  lang: "en", guestName: null, country: null, travellerType: null, room: null, nights: null, checkIn: null,
  checkOut: null, hotelReply: null, helpfulVotes: 0, source: "json", firstSeenAt: "2026-11-25T00:00:00Z", ...over,
});

describe("classifier", () => {
  it("splits complaints and praise by liked/disliked text", () => {
    const t = topicsFor("Great location, friendly staff", "Room was dirty and the aircon was very loud");
    has(t, { topic: "location", polarity: "praise" });
    has(t, { topic: "staff", polarity: "praise" });
    has(t, { topic: "cleanliness", polarity: "complaint" });
    has(t, { topic: "noise", polarity: "complaint" });
    has(t, { topic: "facilities", polarity: "complaint" });
    assert.equal(t.some((h) => h.topic === "location" && h.polarity === "complaint"), false);
  });

  it("ignores 'nothing' style answers in the disliked field", () => {
    for (const s of ["Nothing", "nothing at all", "N/A", "No complaints!", "-"]) assert.equal(isEmptyComplaint(s), true);
    assert.equal(isEmptyComplaint("Nothing worked in the bathroom"), false);
  });

  it("maps scores to sentiment bands", () => {
    assert.equal(sentimentFor(9), "positive");
    assert.equal(sentimentFor(8), "positive");
    assert.equal(sentimentFor(7), "mixed");
    assert.equal(sentimentFor(5.9), "negative");
  });

  it("uses the title on the side matching the score", () => {
    const r = classify(review({ score: 3, title: "Filthy and overpriced", liked: "", disliked: "" }));
    for (const k of ["cleanliness", "value"]) assert.ok(r.topics.some((t) => t.topic === k), k);
  });
});

describe("weeks (Australia/Sydney, Monday start)", () => {
  it("treats Sunday night Sydney time as the same week even though it's Sunday morning UTC", () => {
    // Sun 29 Nov 2026 22:00 Sydney = Sun 29 Nov 11:00 UTC
    const ws = weekStart(new Date("2026-11-29T11:00:00Z"));
    assert.equal(new Date(ws.getTime()).toISOString(), "2026-11-22T13:00:00.000Z"); // Mon 23 Nov 00:00 Sydney (AEDT, UTC+11)
  });

  it("Monday 00:30 Sydney starts a new week", () => {
    const ws = weekStart(new Date("2026-11-29T13:30:00Z")); // Mon 30 Nov 00:30 Sydney
    assert.equal(new Date(ws.getTime()).toISOString(), "2026-11-29T13:00:00.000Z");
  });

  it("previous period is the same length, immediately before", () => {
    const { current, previous } = resolveRange("4w", new Date("2026-11-25T00:00:00Z"));
    assert.equal(current.from.getTime() - previous.from.getTime(), current.to.getTime() - current.from.getTime());
    assert.equal(previous.to.getTime(), current.from.getTime());
  });
});
