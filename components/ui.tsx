import Link from "next/link";
import type { ReactNode } from "react";
import { PROPERTIES } from "@/lib/properties";
import { PRESETS, type Preset } from "@/lib/metrics";
import type { Sentiment } from "@/lib/types";

export type SP = { [key: string]: string | string[] | undefined };
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readFilters(sp: SP) {
  const period = (one(sp.period) in PRESETS ? one(sp.period) : "week") as Preset;
  const property = PROPERTIES.some((p) => p.id === one(sp.property)) ? one(sp.property) : "";
  return { period, property };
}

/** Build a URL keeping the current filters, overriding some. */
export function href(path: string, sp: SP, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (one(v)) q.set(k, one(v));
  for (const [k, v] of Object.entries(patch)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  if (patch.page === undefined) q.delete("page");
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function FilterBar({ path, sp, showPeriod = true }: { path: string; sp: SP; showPeriod?: boolean }) {
  const f = readFilters(sp);
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm border ${active ? "bg-brand text-white border-brand" : "bg-white border-line hover:border-brand"}`;
  return (
    <div className="flex flex-col gap-2 mb-6">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs uppercase tracking-wide text-muted w-16">Property</span>
        <Link className={chip(!f.property)} href={href(path, sp, { property: undefined })}>All properties</Link>
        {PROPERTIES.map((p) => (
          <Link key={p.id} className={chip(f.property === p.id)} href={href(path, sp, { property: p.id })}>
            {p.name}
          </Link>
        ))}
      </div>
      {showPeriod && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wide text-muted w-16">Period</span>
          {Object.entries(PRESETS).map(([k, label]) => (
            <Link key={k} className={chip(f.period === k)} href={href(path, sp, { period: k })}>
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-line p-4 ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {hint && <p className="text-xs text-muted mb-3">{hint}</p>}
      {children}
    </section>
  );
}

export const scoreColor = (s: number | null) =>
  s === null ? "text-muted" : s >= 8 ? "text-good" : s >= 6 ? "text-mid" : "text-bad";

export const sentimentStyle: Record<Sentiment, string> = {
  positive: "bg-green-100 text-green-900",
  mixed: "bg-amber-100 text-amber-900",
  negative: "bg-red-100 text-red-900",
};

export function Delta({ cur, prev, invert = false, pct = false }: { cur: number | null; prev: number | null; invert?: boolean; pct?: boolean }) {
  if (cur === null || prev === null) return <span className="text-muted text-sm">no comparison data</span>;
  const d = cur - prev;
  const shown = pct ? `${Math.abs(Math.round(d * 100))} pts` : Math.abs(d).toFixed(1);
  if (Math.abs(d) < (pct ? 0.005 : 0.05)) return <span className="text-muted text-sm">no change</span>;
  const better = invert ? d < 0 : d > 0;
  return (
    <span className={`text-sm font-medium ${better ? "text-good" : "text-bad"}`}>
      {d > 0 ? "▲" : "▼"} {shown}
    </span>
  );
}

export const LowSample = ({ n }: { n: number }) =>
  n < 5 ? <span className="ml-1 text-xs rounded bg-amber-50 text-amber-800 px-1.5 py-0.5" title="Based on fewer than 5 reviews, so this number can change a lot">only a few reviews</span> : null;
