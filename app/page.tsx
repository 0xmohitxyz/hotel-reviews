import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AiSummaryCard, AiSummarySkeleton } from "@/components/AiSummary";
import { AskAi } from "@/components/AskAi";
import { CHAT_MAX_REVIEWS, aiEnabled, buildChatPrompt } from "@/lib/ai";
import { RatingTrend, SentimentTrend, Sparkline } from "@/components/Charts";
import { Card, Delta, FilterBar, LowSample, href, readFilters, scoreColor, type SP } from "@/components/ui";
import { getReviews } from "@/lib/data";
import { inRange, insights, propertyTable, resolveRange, summarise, weeklySeries } from "@/lib/metrics";
import { propertyName } from "@/lib/properties";

export default function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">How are guests rating us?</h1>
      <p className="text-muted mb-5 text-sm">Booking.com reviews across all Azzurro properties. Click a property or period to filter.</p>
      <Suspense fallback={<p className="text-muted">Loading reviews…</p>}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await connection();
  const now = new Date();
  const { period, property } = readFilters(sp);
  const all = await getReviews();
  const scoped = property ? all.filter((r) => r.propertyId === property) : all;
  const { current, previous } = resolveRange(period, now);
  const cur = scoped.filter((r) => inRange(r, current));
  const prev = scoped.filter((r) => inRange(r, previous));
  const c = summarise(cur);
  const p = summarise(prev);
  const periodWord = period === "week" ? "this week" : period === "all" ? "overall" : "in this period";
  const notes = insights(cur, prev, periodWord);
  const weeks = weeklySeries(scoped, 12, now);
  const table = propertyTable(all, current, previous, now);
  const scope = `${property ? propertyName(property) : "All Azzurro properties"}, ${current.label} (${periodWord})`;
  const withText = cur.filter((r) => r.title || r.liked || r.disliked).length;

  return (
    <>
      <FilterBar path="/" sp={sp} />
      <p className="text-sm text-muted mb-3">
        Showing <b className="text-ink">{property ? propertyName(property) : "all properties"}</b> · {current.label}
        {period !== "all" && <> · compared with {previous.label}</>}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card title="Average rating" hint="Average Booking.com score, out of 10">
          <div className={`text-4xl font-semibold ${scoreColor(c.avg)}`}>{c.avg?.toFixed(1) ?? "–"}</div>
          <div className="mt-1">{period !== "all" && <Delta cur={c.avg} prev={p.avg} />} {period !== "all" && <span className="text-xs text-muted">vs {previous.label} ({p.avg?.toFixed(1) ?? "–"})</span>}</div>
          <LowSample n={c.n} />
        </Card>
        <Card title="Reviews received" hint="New reviews published in the period">
          <div className="text-4xl font-semibold">{c.n}</div>
          {period !== "all" && <div className="text-xs text-muted mt-1">{p.n} {previous.label}</div>}
        </Card>
        <Card title="Negative reviews" hint="Score below 6: likely needs follow-up">
          <div className="text-4xl font-semibold text-bad">{c.neg}</div>
          <div className="mt-1 text-xs text-muted">
            {c.negShare === null ? "–" : `${Math.round(c.negShare * 100)}% of reviews`}
            {period !== "all" && <> · <Delta cur={c.negShare} prev={p.negShare} invert pct /></>}
          </div>
        </Card>
        <Card title="Positive reviews" hint="Score 8 or higher">
          <div className="text-4xl font-semibold text-good">{c.pos}</div>
          <div className="mt-1 text-xs text-muted">{c.n ? `${Math.round((c.pos / c.n) * 100)}% of reviews` : "–"}</div>
        </Card>
      </div>

      {cur.length > 0 && (
        <Card
          title="Ask AI for a summary"
          hint="Get a plain-English summary and a list of what the team should focus on, from the reviews currently shown. Opens ChatGPT, Claude or Gemini in your browser, no setup needed. For answers right here, use ✨ Ask AI."
          className="mb-6"
        >
          <AskAi prompt={buildChatPrompt(scope, cur, prev)} reviewCount={Math.min(withText, CHAT_MAX_REVIEWS)} />
        </Card>
      )}
      {aiEnabled() && (
        <Suspense fallback={<AiSummarySkeleton />}>
          <AiSummaryCard scope={scope} cur={cur} prev={prev} />
        </Suspense>
      )}

      <Card title={`What guests are saying ${periodWord}`} hint="Generated from the topics mentioned in reviews. Click to read the reviews behind each line." className="mb-6">
        {notes.length === 0 ? (
          <p className="text-sm text-muted">No reviews in this period yet. Try “Last 4 weeks”.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span>{n.tone === "bad" ? "🔴" : n.tone === "good" ? "🟢" : "💬"}</span>
                <Link
                  className="hover:underline"
                  href={href("/reviews", sp, {
                    topic: n.topic,
                    sentiment: n.tone === "bad" ? "negative" : n.tone === "good" ? "positive" : "negative",
                    unanswered: n.tone === "info" ? "1" : undefined,
                  })}
                >
                  {n.text}
                </Link>
                {n.lowSample && <LowSample n={0} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Properties at a glance" hint={`${current.label} vs ${previous.label}. Trend line shows the weekly average over the last 12 weeks (dashed line = 8.0).`} className="mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">Property</th><th className="pr-3">Avg rating</th><th className="pr-3">Change</th>
              <th className="pr-3">Reviews</th><th className="pr-3">Negative</th><th className="pr-3">Top complaint</th>
              <th className="pr-3">No hotel reply</th><th>12-week trend</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.id} className={`border-b border-line last:border-0 ${property === r.id ? "bg-paper" : ""}`}>
                <td className="py-2.5 pr-3 font-medium"><Link className="hover:underline" href={href("/", sp, { property: r.id })}>{r.name}</Link></td>
                <td className={`pr-3 font-semibold ${scoreColor(r.current.avg)}`}>{r.current.avg?.toFixed(1) ?? "–"}<LowSample n={r.current.n} /></td>
                <td className="pr-3"><Delta cur={r.current.avg} prev={r.previous.avg} /></td>
                <td className="pr-3">{r.current.n}</td>
                <td className="pr-3">{r.current.neg}</td>
                <td className="pr-3">{r.topComplaint ? <Link className="hover:underline" href={href("/reviews", sp, { property: r.id, topic: r.topComplaint.id, sentiment: undefined })}>{r.topComplaint.label} ({r.topComplaint.complaints})</Link> : <span className="text-muted">–</span>}</td>
                <td className="pr-3">{r.unanswered ? <Link className="text-bad hover:underline" href={href("/reviews", sp, { property: r.id, sentiment: "negative", unanswered: "1" })}>{r.unanswered}</Link> : "0"}</td>
                <td><Sparkline values={r.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Positive vs negative reviews, by week" hint="Last 12 weeks. Taller red sections mean more unhappy guests that week.">
          <SentimentTrend data={weeks} />
        </Card>
        <Card title="Average rating, by week" hint="Last 12 weeks. Gaps mean no reviews that week.">
          <RatingTrend data={weeks} />
        </Card>
      </div>
    </>
  );
}
