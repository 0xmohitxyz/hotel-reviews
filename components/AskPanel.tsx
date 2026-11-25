"use client";

import { Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  DEFAULT_MODELS, PROVIDERS, askLLM, clearSettings, parseSettings, readRaw, readRawServer, saveSettings, subscribe,
  type AiSettings, type Provider,
} from "@/lib/llm-browser";
import { AskAi } from "./AskAi";

export const SUGGESTED = [
  "What issues did guests face in this period?",
  "What should we improve first, and how?",
  "Which property needs the most attention, and why?",
  "What do guests love that we should keep doing?",
  "Are there any safety, hygiene or maintenance problems mentioned?",
  "Summarise the negative reviews in 5 bullet points.",
  "What are non-English-speaking guests saying?",
  "How has guest sentiment changed compared with the previous period?",
  "Which complaints could housekeeping fix this week?",
  "Draft a polite reply to the most recent negative review.",
];

type QA = { q: string; a?: string; error?: string; provider: string };

export function AskPanel({ system, context, reviewCount, scope }: { system: string; context: string; reviewCount: number; scope: string }) {
  const raw = useSyncExternalStore(subscribe, readRaw, readRawServer);
  const settings = useMemo(() => parseSettings(raw), [raw]);
  const [showSettings, setShowSettings] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);

  const hasKey = !!settings?.keys[settings.provider];
  const providerLabel = PROVIDERS.find((p) => p.id === settings?.provider)?.label ?? "";

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setQuestion("");
    const item: QA = { q, provider: providerLabel };
    setHistory((h) => [item, ...h]);
    try {
      const a = await askLLM(settings, system, context, q);
      setHistory((h) => h.map((x) => (x === item ? { ...x, a } : x)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistory((h) => h.map((x) => (x === item ? { ...x, error: msg } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasKey ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
          <span>✅ AI is set up on this device <span className="text-muted">({providerLabel})</span></span>
          <button onClick={() => setShowSettings((v) => !v)} className="ml-auto rounded-md border border-line px-3 py-1.5 hover:border-brand">
            ⚙ AI settings
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-brand/40 bg-blue-50/60 p-4 text-sm">
          <p className="font-semibold mb-1">One-time setup: enter your team&apos;s AI access key</p>
          <p className="text-muted mb-3">
            Ask your manager or IT team for the hotel&apos;s AI access key, paste it once, and you&apos;re ready to go. You don&apos;t need your
            own account. In the meantime you can use the copy buttons at the bottom of this page.
          </p>
          <button onClick={() => setShowSettings(true)} className="rounded-md bg-brand px-4 py-2 text-white">Enter access key</button>
        </div>
      )}

      {showSettings && <SettingsForm settings={settings} onSave={(s) => { saveSettings(s); setShowSettings(false); }} onClear={() => clearSettings()} />}

      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold">Ask about {scope}</h2>
        <p className="text-xs text-muted mb-3">The AI will read the {reviewCount} written reviews for the property and dates you picked above. Guest names are left out.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTED.map((q) => (
            <button key={q} disabled={!hasKey || busy} onClick={() => ask(q)}
              className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50 disabled:cursor-not-allowed">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!hasKey}
            placeholder={hasKey ? "Ask your own question, e.g. “What do families say about the rooms?”" : "Enter your team's AI access key above to ask questions"}
            className="flex-1 rounded-md border border-line px-3 py-2 text-sm disabled:bg-paper" />
          <button disabled={!hasKey || busy || !question.trim()} className="rounded-md bg-brand px-4 text-sm text-white disabled:opacity-50">
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>
      </section>

      {history.map((h, i) => (
        <article key={i} className="rounded-xl border border-line bg-white p-4">
          <p className="font-medium mb-1">Q: {h.q}</p>
          <p className="text-xs text-muted mb-3">Answer by {h.provider} · AI can make mistakes, so check the reviews before acting</p>
          {h.error ? <p className="text-sm text-bad">⚠ {h.error}</p> : h.a ? <Markdown text={h.a} /> : <p className="text-sm text-muted animate-pulse">Reading the reviews…</p>}
        </article>
      ))}

      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold mb-1">No access key yet? Use ChatGPT, Claude or Gemini in your browser</h2>
        <p className="text-xs text-muted mb-3">Copies the reviews (and your question, if you typed one) and opens the AI chat. Then just paste and press Enter.</p>
        <AskAi prompt={`${system}\n\n${context}\n\nQuestion: ${question.trim() || SUGGESTED[1]}`} reviewCount={reviewCount} />
      </section>
    </div>
  );
}

function SettingsForm({ settings, onSave, onClear }: { settings: AiSettings; onSave: (s: AiSettings) => void; onClear: () => void }) {
  const [draft, setDraft] = useState<AiSettings>(settings);
  const p = PROVIDERS.find((x) => x.id === draft.provider)!;
  const set = (patch: Partial<AiSettings>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <section className="rounded-xl border border-brand/40 bg-white p-4 text-sm space-y-3">
      <h2 className="font-semibold">AI access</h2>
      <p className="text-xs text-muted">Your manager or IT team will give you an access key and tell you which AI service it&apos;s for.</p>
      <div>
        <span className="text-xs text-muted">AI service</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {PROVIDERS.map((x) => (
            <button key={x.id} type="button" onClick={() => set({ provider: x.id as Provider })}
              className={`rounded-full border px-3 py-1.5 ${draft.provider === x.id ? "border-brand bg-brand text-white" : "border-line hover:border-brand"}`}>
              {x.label}{draft.keys[x.id] ? " ✓" : ""}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-xs text-muted">Team AI access key</span>
        <input type="password" autoComplete="off" value={draft.keys[draft.provider] ?? ""} placeholder={`Paste the key here (starts with ${p.keyHint})`}
          onChange={(e) => set({ keys: { ...draft.keys, [draft.provider]: e.target.value } })}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 font-mono" />
      </label>
      <p className="text-xs text-muted">
        🔒 The key is remembered on this computer only. Please don&apos;t
        enter it on a shared or public computer. Usage is covered by the hotel&apos;s AI account.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Advanced (for managers / IT)</summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-muted">Model (default {DEFAULT_MODELS[draft.provider]})</span>
            <input value={draft.models[draft.provider]} onChange={(e) => set({ models: { ...draft.models, [draft.provider]: e.target.value } })}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 font-mono" />
          </label>
          <p className="text-muted">
            Setting up AI access for the team? Create one key in the {p.label} console (
            <a className="text-brand underline" href={p.keyUrl} target="_blank" rel="noopener noreferrer">open ↗</a>
            ), ideally with a monthly spending limit, and share it with staff.
          </p>
        </div>
      </details>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(draft)} className="rounded-md bg-brand px-4 py-2 text-white">Save</button>
        <button type="button" onClick={onClear} className="rounded-md border border-line px-4 py-2 hover:border-bad hover:text-bad">Remove key from this computer</button>
      </div>
    </section>
  );
}

/** Minimal, safe Markdown rendering (headings, bullets, numbered lists, bold). No HTML injection. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} pl-5 space-y-1 mb-2`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    blocks.push(h ? <h3 key={blocks.length} className="font-semibold mt-3 mb-1">{inline(h[1])}</h3> : <p key={blocks.length} className="mb-2">{inline(line)}</p>);
  }
  flush();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}
