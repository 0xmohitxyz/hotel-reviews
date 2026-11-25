import { cacheLife } from "next/cache";
import { topicLabel } from "./classify";
import { propertyName } from "./properties";
import { summarise, topicBreakdown } from "./metrics";
import type { ClassifiedReview } from "./types";

/**
 * AI summary + "where to pay attention" using the Gemini API.
 *
 * Grounding: we send our own computed statistics plus the review texts, and
 * the model must only cite those numbers. Guest names are never sent.
 * Results are cached (keyed by the exact input), so a page view doesn't
 * trigger a new API call unless the underlying reviews changed.
 */
export type AiSummary = {
  summary: string;
  attention: {
    title: string;
    property: string;
    priority: "high" | "medium" | "low";
    evidence: string;
    action: string;
  }[];
  strengths: string[];
};

export const aiEnabled = () => Boolean(process.env.GEMINI_API_KEY);
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_REVIEWS = 150;
export const CHAT_MAX_REVIEWS = 80;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "2-3 plain-English sentences for hotel operations staff." },
    attention: {
      type: "ARRAY",
      maxItems: 4,
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Short issue name, e.g. 'Broken air-conditioning'" },
          property: { type: "STRING", description: "Property name, or 'All properties'" },
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
          evidence: { type: "STRING", description: "Counts from the data, e.g. '4 of 9 negative reviews'" },
          action: { type: "STRING", description: "One concrete next step for the team" },
        },
        required: ["title", "property", "priority", "evidence", "action"],
      },
    },
    strengths: { type: "ARRAY", maxItems: 3, items: { type: "STRING" } },
  },
  required: ["summary", "attention", "strengths"],
};

export const SYSTEM = `You analyse hotel guest reviews for the operations team of Azzurro Hotels (Sydney).
Rules:
- Use ONLY the statistics and reviews provided. Never invent numbers; quote counts exactly as given or count them from the reviews listed.
- Reviews may be in any language; read them all, write your answer in English.
- Prioritise issues that are frequent, recent, severe (safety, hygiene, broken essentials) or fixable by operations.
- Be specific (e.g. "hot water not working in shared bathrooms"), not generic ("improve guest experience").
- Plain language, no jargon. Keep each field short.`;

export function buildPrompt(scope: string, cur: ClassifiedReview[], prev: ClassifiedReview[], max = MAX_REVIEWS) {
  const s = summarise(cur);
  const p = summarise(prev);
  const negTopics = topicBreakdown(cur.filter((r) => r.sentiment === "negative"))
    .filter((t) => t.complaints > 0)
    .map((t) => `${t.label}: ${t.complaints}`)
    .join(", ");
  const byProp = [...new Set(cur.map((r) => r.propertyId))]
    .map((id) => {
      const x = summarise(cur.filter((r) => r.propertyId === id));
      return `- ${propertyName(id)}: ${x.n} reviews, average ${x.avg?.toFixed(1)}, ${x.neg} negative`;
    })
    .join("\n");

  const withText = cur.filter((r) => r.title || r.liked || r.disliked).slice(0, max);
  const clip = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 400);
  const lines = withText.map(
    (r) =>
      `[${propertyName(r.propertyId)} | ${r.reviewedAt.slice(0, 10)} | score ${r.score} | ${r.lang ?? "?"}${r.hotelReply ? " | hotel replied" : ""}] ` +
      `Title: ${clip(r.title)} | Liked: ${clip(r.liked)} | Disliked: ${clip(r.disliked)} ` +
      `| Keyword topics: ${r.topics.map((t) => `${t.polarity === "complaint" ? "-" : "+"}${topicLabel(t.topic)}`).join(", ") || "none"}`,
  );

  return `Scope: ${scope}
STATISTICS (computed by our system, trust these)
- Reviews in period: ${s.n} (previous period: ${p.n})
- Average score: ${s.avg?.toFixed(2) ?? "n/a"} (previous: ${p.avg?.toFixed(2) ?? "n/a"})
- Negative (<6): ${s.neg}, mixed: ${s.mixed}, positive (8+): ${s.pos}
- Negative reviews with no hotel reply: ${cur.filter((r) => r.sentiment === "negative" && !r.hotelReply).length}
- Complaint topics in negative reviews (keyword-based): ${negTopics || "none"}
By property:
${byProp || "- none"}

REVIEWS (${withText.length} with text, newest first${cur.length > withText.length ? `; ${cur.length - withText.length} rating-only reviews omitted` : ""})
${lines.join("\n")}

Write the summary, up to 4 attention items ranked by priority, and up to 3 strengths.`;
}

async function callGemini(prompt: string): Promise<AiSummary> {
  "use cache";
  cacheLife("hours");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no content (${json?.candidates?.[0]?.finishReason ?? "unknown"})`);
  return JSON.parse(text) as AiSummary;
}

export async function getAiSummary(scope: string, cur: ClassifiedReview[], prev: ClassifiedReview[]) {
  return callGemini(buildPrompt(scope, cur, prev));
}

/** Prompt for pasting into ChatGPT / Claude / Gemini chat (no API key needed). */
export function buildChatPrompt(scope: string, cur: ClassifiedReview[], prev: ClassifiedReview[]) {
  return `${SYSTEM}

${buildPrompt(scope, cur, prev, CHAT_MAX_REVIEWS)}

Answer in this format:
1. **Summary**: 2-3 sentences.
2. **Where the team should pay attention**: up to 4 items, highest priority first. For each: issue, property, priority (high/medium/low), evidence (counts), one suggested action.
3. **Doing well**: up to 3 points.`;
}
