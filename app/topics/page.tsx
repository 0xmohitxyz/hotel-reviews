import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, FilterBar, LowSample, href, readFilters, type SP } from "@/components/ui";
import { TOPICS } from "@/lib/classify";
import { getReviews } from "@/lib/data";
import { inRange, resolveRange, topicBreakdown } from "@/lib/metrics";
import { PROPERTIES } from "@/lib/properties";

export default function TopicsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">What do guests complain about?</h1>
      <p className="text-muted mb-5 text-sm">
        Each review is checked for words about common topics, like “dirty” or “noisy”. A topic counts as a <b>complaint</b> when it
        appears in what the guest <i>disliked</i>, and as <b>praise</b> when it appears in what they <i>liked</i>.
      </p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Topics searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function heat(share: number) {
  if (share >= 0.4) return "bg-red-600 text-white";
  if (share >= 0.25) return "bg-red-400 text-white";
  if (share >= 0.15) return "bg-red-200";
  if (share > 0) return "bg-red-50";
  return "text-muted";
}

async function Topics({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await connection();
  const { period, property } = readFilters(sp);
  const { current } = resolveRange(period, new Date());
  const all = (await getReviews()).filter((r) => inRange(r, current));
  const scoped = property ? all.filter((r) => r.propertyId === property) : all;
  const overall = topicBreakdown(scoped).sort((a, b) => b.complaints - a.complaints);
  const props = PROPERTIES.map((p) => {
    const rs = all.filter((r) => r.propertyId === p.id);
    return { ...p, n: rs.length, topics: topicBreakdown(rs) };
  });

  return (
    <>
      <FilterBar path="/topics" sp={sp} />
      <p className="text-sm text-muted mb-3">{scoped.length} reviews · {current.label}</p>

      <Card title="Complaints vs praise by topic" hint="Number of reviews mentioning each topic negatively (red) or positively (green). Click a topic to read those reviews." className="mb-6">
        <div className="space-y-2">
          {overall.map((t) => {
            const max = Math.max(1, ...overall.map((o) => Math.max(o.complaints, o.praise)));
            return (
              <div key={t.id} className="grid grid-cols-[10rem_1fr_1fr] items-center gap-3 text-sm">
                <Link className="hover:underline font-medium" href={href("/reviews", sp, { topic: t.id })}>{t.label}</Link>
                <div className="flex justify-end items-center gap-2">
                  <span className="text-xs text-bad tabular-nums">{t.complaints}</span>
                  <div className="h-3 rounded-l bg-bad" style={{ width: `${(t.complaints / max) * 100}%` }} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 rounded-r bg-good" style={{ width: `${(t.praise / max) * 100}%` }} />
                  <span className="text-xs text-good tabular-nums">{t.praise}</span>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[10rem_1fr_1fr] text-xs text-muted"><span /><span className="text-right">◀ complaints</span><span>praise ▶</span></div>
        </div>
      </Card>

      <Card title="Problem hotspots by property" hint="Share of each property's reviews that complain about the topic. Darker red = more common. Use this to see where to send maintenance, housekeeping or training effort." className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted text-left border-b border-line">
              <th className="py-2 pr-3">Topic</th>
              {props.map((p) => <th key={p.id} className="px-2 text-center">{p.name}<div className="font-normal">{p.n} reviews <LowSample n={p.n} /></div></th>)}
            </tr>
          </thead>
          <tbody>
            {TOPICS.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 font-medium">{t.label}</td>
                {props.map((p) => {
                  const c = p.topics.find((x) => x.id === t.id)!.complaints;
                  const share = p.n ? c / p.n : 0;
                  return (
                    <td key={p.id} className="px-1 py-1 text-center">
                      <Link href={href("/reviews", sp, { property: p.id, topic: t.id })} className={`block rounded px-2 py-1.5 ${heat(share)}`}>
                        {p.n ? `${Math.round(share * 100)}%` : "–"} <span className="text-xs opacity-75">({c})</span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
