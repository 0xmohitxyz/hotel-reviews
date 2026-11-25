import { connection } from "next/server";
import { Suspense } from "react";
import { AskPanel } from "@/components/AskPanel";
import { FilterBar, readFilters, type SP } from "@/components/ui";
import { SYSTEM, buildPrompt } from "@/lib/ai";
import { getReviews } from "@/lib/data";
import { inRange, resolveRange } from "@/lib/metrics";
import { propertyName } from "@/lib/properties";

const MAX_REVIEWS = 120;

export default function AskPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Ask AI about the reviews</h1>
      <p className="text-muted mb-5 text-sm">
        Pick a property and period, then ask a question or tap a suggestion. Answers are written by AI using your team&apos;s access key.
      </p>
      <Suspense fallback={<p className="text-muted">Loading reviews…</p>}>
        <Ask searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Ask({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await connection();
  const { period, property } = readFilters(sp);
  const { current, previous } = resolveRange(period, new Date());
  const all = (await getReviews()).filter((r) => !property || r.propertyId === property);
  const cur = all.filter((r) => inRange(r, current));
  const prev = all.filter((r) => inRange(r, previous));
  const scope = `${property ? propertyName(property) : "all properties"}, ${current.label}`;
  const withText = cur.filter((r) => r.title || r.liked || r.disliked).length;

  return (
    <>
      <FilterBar path="/ask" sp={sp} />
      {cur.length === 0 ? (
        <p className="text-muted">No reviews in this period. Try a longer period.</p>
      ) : (
        <AskPanel system={SYSTEM} context={buildPrompt(scope, cur, prev, MAX_REVIEWS)} reviewCount={Math.min(withText, MAX_REVIEWS)} scope={scope} />
      )}
    </>
  );
}
