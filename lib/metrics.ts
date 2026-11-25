import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, format, startOfWeek, subDays } from "date-fns";
import { TOPICS, topicLabel } from "./classify";
import { PROPERTIES } from "./properties";
import type { ClassifiedReview } from "./types";

/** All "this week" logic uses Sydney time, Monday–Sunday. */
export const TZ = "Australia/Sydney";
export const LOW_SAMPLE = 5;

export type Range = { from: Date; to: Date; label: string };

export function weekStart(d: Date): Date {
  return startOfWeek(new TZDate(d, TZ), { weekStartsOn: 1 });
}

export const PRESETS = {
  week: "This week",
  "4w": "Last 4 weeks",
  "12w": "Last 12 weeks",
  all: "All time",
} as const;
export type Preset = keyof typeof PRESETS;

/** Selected period plus the equally long period right before it (for comparison). */
export function resolveRange(preset: Preset, now: Date): { current: Range; previous: Range } {
  const thisWeek = weekStart(now);
  const end = addWeeks(thisWeek, 1);
  const weeks = preset === "week" ? 1 : preset === "4w" ? 4 : preset === "12w" ? 12 : 520;
  const from = addWeeks(end, -weeks);
  const prevFrom = addWeeks(from, -weeks);
  const fmt = (d: Date) => format(new TZDate(d, TZ), "d MMM");
  return {
    current: { from, to: end, label: preset === "all" ? "All time" : `${fmt(from)} – ${fmt(subDays(end, 1))}` },
    previous: { from: prevFrom, to: from, label: preset === "week" ? "last week" : "the previous period" },
  };
}

export const inRange = (r: ClassifiedReview, range: Range) => {
  const t = new Date(r.reviewedAt).getTime();
  return t >= range.from.getTime() && t < range.to.getTime();
};

export function summarise(reviews: ClassifiedReview[]) {
  const n = reviews.length;
  const avg = n ? reviews.reduce((s, r) => s + r.score, 0) / n : null;
  const neg = reviews.filter((r) => r.sentiment === "negative").length;
  const pos = reviews.filter((r) => r.sentiment === "positive").length;
  return { n, avg, neg, pos, mixed: n - neg - pos, negShare: n ? neg / n : null };
}

/** Share of reviews that complain about each topic, most-mentioned first. */
export function topicBreakdown(reviews: ClassifiedReview[]) {
  return TOPICS.map((t) => {
    const complaints = reviews.filter((r) => r.topics.some((h) => h.topic === t.id && h.polarity === "complaint")).length;
    const praise = reviews.filter((r) => r.topics.some((h) => h.topic === t.id && h.polarity === "praise")).length;
    return { id: t.id, label: t.label, complaints, praise };
  });
}

/** Weekly series for trend charts (oldest → newest). */
export function weeklySeries(reviews: ClassifiedReview[], weeks: number, now: Date) {
  const start = addWeeks(weekStart(now), -(weeks - 1));
  return Array.from({ length: weeks }, (_, i) => {
    const from = addWeeks(start, i);
    const to = addDays(from, 7);
    const s = summarise(reviews.filter((r) => inRange(r, { from, to, label: "" })));
    return {
      week: format(new TZDate(from, TZ), "d MMM"),
      avg: s.avg === null ? null : Math.round(s.avg * 10) / 10,
      positive: s.pos,
      mixed: s.mixed,
      negative: s.neg,
      total: s.n,
    };
  });
}

export function propertyTable(all: ClassifiedReview[], cur: Range, prev: Range, now: Date) {
  return PROPERTIES.map((p) => {
    const mine = all.filter((r) => r.propertyId === p.id);
    const c = mine.filter((r) => inRange(r, cur));
    const pr = mine.filter((r) => inRange(r, prev));
    const top = topicBreakdown(c).sort((a, b) => b.complaints - a.complaints)[0];
    const unanswered = c.filter((r) => r.sentiment === "negative" && !r.hotelReply).length;
    return {
      ...p,
      current: summarise(c),
      previous: summarise(pr),
      topComplaint: top && top.complaints > 0 ? top : null,
      unanswered,
      trend: weeklySeries(mine, 12, now).map((w) => w.avg),
    };
  });
}

/**
 * Plain-English insight sentences, e.g.
 * "40% of negative reviews this week mentioned cleanliness (4 of 10)."
 * Always shows the raw count; flags small samples instead of hiding them.
 */
export function insights(cur: ClassifiedReview[], prev: ClassifiedReview[], periodWord: string) {
  const out: { text: string; tone: "bad" | "good" | "info"; lowSample: boolean; topic?: string }[] = [];
  const negatives = cur.filter((r) => r.sentiment === "negative");
  const prevNeg = prev.filter((r) => r.sentiment === "negative");

  if (negatives.length) {
    const tb = topicBreakdown(negatives).filter((t) => t.complaints > 0).sort((a, b) => b.complaints - a.complaints);
    for (const t of tb.slice(0, 3)) {
      const share = Math.round((t.complaints / negatives.length) * 100);
      const before = prevNeg.length ? topicBreakdown(prevNeg).find((x) => x.id === t.id)!.complaints / prevNeg.length : null;
      const change = before === null ? "" : share > Math.round(before * 100) ? ` (up from ${Math.round(before * 100)}%)` : share < Math.round(before * 100) ? ` (down from ${Math.round(before * 100)}%)` : "";
      out.push({
        text: `${share}% of negative reviews ${periodWord} mentioned ${t.label.toLowerCase()} (${t.complaints} of ${negatives.length})${change}.`,
        tone: "bad",
        lowSample: negatives.length < LOW_SAMPLE,
        topic: t.id,
      });
    }
  }
  const praised = topicBreakdown(cur).sort((a, b) => b.praise - a.praise)[0];
  if (praised && praised.praise > 0 && cur.length) {
    out.push({
      text: `Guests praised ${praised.label.toLowerCase()} most often: ${praised.praise} of ${cur.length} reviews ${periodWord}.`,
      tone: "good",
      lowSample: cur.length < LOW_SAMPLE,
      topic: praised.id,
    });
  }
  const unanswered = negatives.filter((r) => !r.hotelReply).length;
  if (unanswered) {
    out.push({
      text: `${unanswered} negative review${unanswered > 1 ? "s" : ""} ${periodWord} ${unanswered > 1 ? "have" : "has"} no reply from the hotel yet.`,
      tone: "info",
      lowSample: false,
    });
  }
  return out;
}

export { topicLabel };
