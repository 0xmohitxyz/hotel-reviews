import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FilterBar, href, one, readFilters, sentimentStyle, type SP } from "@/components/ui";
import { TOPICS, topicLabel } from "@/lib/classify";
import { getReviews } from "@/lib/data";
import { TZ, inRange, resolveRange } from "@/lib/metrics";
import { googleTranslateUrl, isEnglish, languageName } from "@/lib/lang";
import { propertyName } from "@/lib/properties";

const PER_PAGE = 20;

export default function ReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Review feed</h1>
      <p className="text-muted mb-5 text-sm">Read individual guest reviews, newest first. Combine filters to narrow down.</p>
      <Suspense fallback={<p className="text-muted">Loading reviews…</p>}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Feed({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await connection();
  const { period, property } = readFilters(sp);
  const sentiment = one(sp.sentiment);
  const topic = one(sp.topic);
  const q = one(sp.q).trim().toLowerCase();
  const unanswered = one(sp.unanswered) === "1";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { current } = resolveRange(period, new Date());
  const rows = (await getReviews()).filter(
    (r) =>
      inRange(r, current) &&
      (!property || r.propertyId === property) &&
      (!sentiment || r.sentiment === sentiment) &&
      (!topic || r.topics.some((t) => t.topic === topic && (sentiment !== "positive" ? true : t.polarity === "praise"))) &&
      (!unanswered || !r.hotelReply) &&
      (!q || `${r.title} ${r.liked} ${r.disliked}`.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs border ${active ? "bg-ink text-white border-ink" : "bg-white border-line hover:border-ink"}`;

  return (
    <>
      <FilterBar path="/reviews" sp={sp} />
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <span className="text-xs uppercase tracking-wide text-muted w-16">Rating</span>
        {[["", "All"], ["negative", "Negative (<6)"], ["mixed", "Mixed (6–7.9)"], ["positive", "Positive (8+)"]].map(([k, l]) => (
          <Link key={k} className={pill(sentiment === k)} href={href("/reviews", sp, { sentiment: k || undefined })}>{l}</Link>
        ))}
        <Link className={pill(unanswered)} href={href("/reviews", sp, { unanswered: unanswered ? undefined : "1" })}>No hotel reply</Link>
      </div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <span className="text-xs uppercase tracking-wide text-muted w-16">Topic</span>
        <Link className={pill(!topic)} href={href("/reviews", sp, { topic: undefined })}>Any</Link>
        {TOPICS.map((t) => (
          <Link key={t.id} className={pill(topic === t.id)} href={href("/reviews", sp, { topic: t.id })}>{t.label}</Link>
        ))}
      </div>
      <form className="flex gap-2 mb-4" action="/reviews">
        {Object.entries(sp).filter(([k]) => k !== "q" && k !== "page").map(([k, v]) => <input key={k} type="hidden" name={k} value={one(v)} />)}
        <input name="q" defaultValue={one(sp.q)} placeholder="Search review text, e.g. “towels”" className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm" />
        <button className="rounded-md bg-brand text-white px-4 text-sm">Search</button>
      </form>

      <p className="text-sm text-muted mb-3">{rows.length} review{rows.length === 1 ? "" : "s"} match · {current.label}</p>

      <div className="space-y-3">
        {shown.map((r) => (
          <article key={r.id} className="bg-white rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`rounded-md px-2 py-0.5 font-semibold ${sentimentStyle[r.sentiment]}`}>{r.score.toFixed(1)}</span>
              <h3 className="font-semibold">{r.title || <span className="text-muted font-normal">(no title)</span>}</h3>
            </div>
            <p className="text-xs text-muted mb-3">
              {propertyName(r.propertyId)} · {format(new TZDate(r.reviewedAt, TZ), "EEE d MMM yyyy")}
              {r.guestName && <> · {r.guestName}</>}{r.country && <> from {r.country}</>}
              {r.travellerType && <> · {r.travellerType}</>}{r.nights && <> · {r.nights} night{r.nights > 1 ? "s" : ""}</>}
              {r.room && <> · {r.room}</>}
              {!isEnglish(r.lang) && <> · <span className="rounded bg-paper px-1.5 py-0.5">{languageName(r.lang)}</span></>}
            </p>
            {r.liked && <p className="text-sm mb-1.5"><span className="text-good font-medium">Liked: </span>{r.liked}</p>}
            {r.disliked && <p className="text-sm mb-1.5"><span className="text-bad font-medium">Disliked: </span>{r.disliked}</p>}
            {!r.liked && !r.disliked && <p className="text-sm text-muted">Rating only, no written comments.</p>}
            {!isEnglish(r.lang) && (r.title || r.liked || r.disliked) && (
              <a
                href={googleTranslateUrl([r.title, r.liked && `Liked: ${r.liked}`, r.disliked && `Disliked: ${r.disliked}`].filter(Boolean).join("\n\n"))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-sm text-brand hover:underline"
              >
                🌐 Translate to English (Google Translate) ↗
              </a>
            )}
            {r.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {r.topics.map((t) => (
                  <span key={t.topic + t.polarity} className={`text-xs rounded px-1.5 py-0.5 ${t.polarity === "complaint" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
                    {t.polarity === "complaint" ? "−" : "+"} {topicLabel(t.topic)}
                  </span>
                ))}
              </div>
            )}
            {r.hotelReply ? (
              <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand">Hotel replied</summary><p className="mt-1 text-muted whitespace-pre-line">{r.hotelReply}</p></details>
            ) : r.sentiment === "negative" ? (
              <p className="mt-2 text-xs text-bad">No reply from the hotel yet</p>
            ) : null}
          </article>
        ))}
        {shown.length === 0 && <p className="text-muted">No reviews match these filters. Try a longer period.</p>}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 mt-6 text-sm">
          {page > 1 && <Link className="underline" href={href("/reviews", sp, { page: String(page - 1) })}>← Newer</Link>}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages && <Link className="underline" href={href("/reviews", sp, { page: String(page + 1) })}>Older →</Link>}
        </div>
      )}
    </>
  );
}
