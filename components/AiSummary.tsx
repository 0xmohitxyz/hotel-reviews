import { aiEnabled, getAiSummary } from "@/lib/ai";
import type { ClassifiedReview } from "@/lib/types";
import { Card } from "./ui";

const PRIORITY = {
  high: "bg-red-100 text-red-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-slate-100 text-slate-700",
};

export function AiSummarySkeleton() {
  return (
    <Card title="✨ AI summary" hint="Reading this period's reviews…" className="mb-6">
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-paper rounded w-11/12" />
        <div className="h-3 bg-paper rounded w-9/12" />
        <div className="h-3 bg-paper rounded w-10/12" />
      </div>
    </Card>
  );
}

export async function AiSummaryCard({ scope, cur, prev }: { scope: string; cur: ClassifiedReview[]; prev: ClassifiedReview[] }) {
  const hint = "Written by AI (Google Gemini) from the reviews in this period, including non-English ones. Check the reviews before acting.";
  if (!aiEnabled() || cur.length === 0) return null;

  let ai;
  try {
    ai = await getAiSummary(scope, cur, prev);
  } catch (e) {
    console.error("[ai-summary]", e);
    return (
      <Card title="✨ AI summary" hint={hint} className="mb-6">
        <p className="text-sm text-muted">The AI summary is unavailable right now. The rest of the dashboard is unaffected.</p>
      </Card>
    );
  }

  return (
    <Card title="✨ AI summary" hint={hint} className="mb-6">
      <p className="text-sm leading-relaxed mb-4">{ai.summary}</p>
      {ai.attention.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mb-2">Where the team should pay attention</h3>
          <ol className="space-y-2 mb-4">
            {ai.attention.map((a, i) => (
              <li key={i} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold uppercase rounded px-1.5 py-0.5 ${PRIORITY[a.priority] ?? PRIORITY.low}`}>{a.priority}</span>
                  <span className="font-semibold">{a.title}</span>
                  <span className="text-xs text-muted">· {a.property}</span>
                </div>
                <p className="text-muted text-xs mb-1">{a.evidence}</p>
                <p><span className="font-medium">Suggested action:</span> {a.action}</p>
              </li>
            ))}
          </ol>
        </>
      )}
      {ai.strengths.length > 0 && (
        <p className="text-sm"><span className="font-semibold text-good">Doing well: </span>{ai.strengths.join(" · ")}</p>
      )}
    </Card>
  );
}
