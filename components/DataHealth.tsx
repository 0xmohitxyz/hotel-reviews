import { formatDistanceStrict } from "date-fns";
import { connection } from "next/server";
import { getRecentRuns } from "@/lib/data";
import { propertyName } from "@/lib/properties";

/** "Data last updated …" plus a warning if the latest collection run had problems. */
export async function DataHealth() {
  await connection(); // "x hours ago" depends on the current time
  const runs = await getRecentRuns();
  if (!runs.length) return <span>Reviews not updated yet</span>;

  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.propertyId)) latest.set(r.propertyId, r);
  const last = runs[0];
  const problems = [...latest.values()].filter((r) => r.status !== "ok");

  return (
    <span className="flex items-center gap-3">
      <span>
        Reviews last updated {formatDistanceStrict(new Date(last.finishedAt), new Date(), { addSuffix: true })}
      </span>
      {problems.length > 0 && (
        <span
          className="rounded bg-amber-100 text-amber-900 px-2 py-0.5"
          title={problems.map((p) => `${propertyName(p.propertyId)}: ${p.status} ${p.message ?? ""}`).join("\n")}
        >
          ⚠ Couldn&apos;t check for new reviews: {problems.map((p) => propertyName(p.propertyId)).join(", ")}
        </span>
      )}
    </span>
  );
}
