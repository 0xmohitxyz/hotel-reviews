"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Week = { week: string; avg: number | null; positive: number; mixed: number; negative: number; total: number };

const C = { good: "#1d7a4a", mid: "#d99a2b", bad: "#b4332d", brand: "#0f5b8c", grid: "#e3e7ec", text: "#5d6b7c" };

/** Stacked weekly counts of positive / mixed / negative reviews. */
export function SentimentTrend({ data }: { data: Week[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.text }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.text }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#f0f3f6" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="positive" name="Positive (8+)" stackId="s" fill={C.good} />
          <Bar dataKey="mixed" name="Mixed (6–7.9)" stackId="s" fill={C.mid} />
          <Bar dataKey="negative" name="Negative (<6)" stackId="s" fill={C.bad} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekly average score line. Weeks with no reviews are left as gaps. */
export function RatingTrend({ data }: { data: Week[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.text }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: C.text }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [v, "Average score"]} />
          <Line type="monotone" dataKey="avg" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} name="Average score" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny 12-week sparkline for the property table. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 96, h = 28;
  const pts = values.map((v, i) => (v === null ? null : [(i / (values.length - 1)) * w, h - (v / 10) * h] as const));
  const segs: string[] = [];
  let cur = "";
  for (const p of pts) {
    if (!p) { if (cur) segs.push(cur); cur = ""; continue; }
    cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }
  if (cur) segs.push(cur);
  return (
    <svg width={w} height={h} aria-label="12-week average score trend" className="overflow-visible">
      <line x1={0} x2={w} y1={h - 0.8 * h} y2={h - 0.8 * h} stroke={C.grid} strokeDasharray="2 2" />
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={C.brand} strokeWidth={1.5} />)}
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={1.6} fill={C.brand} />)}
    </svg>
  );
}
