"use client";

import { useState } from "react";

/**
 * "Ask AI" without an API key: copies a ready-made prompt (stats + reviews for
 * the current filters) to the clipboard and opens the chosen assistant.
 * ChatGPT and Claude accept a prefilled prompt via ?q= when it's short enough
 * for a URL; otherwise (and for Gemini) the user pastes with Ctrl+V.
 */
const URL_LIMIT = 6000; // stay well below typical URL length limits

const TOOLS = [
  { id: "chatgpt", label: "ChatGPT", url: (q?: string) => (q ? `https://chatgpt.com/?q=${q}` : "https://chatgpt.com/") },
  { id: "claude", label: "Claude", url: (q?: string) => (q ? `https://claude.ai/new?q=${q}` : "https://claude.ai/new") },
  { id: "gemini", label: "Gemini", url: () => "https://gemini.google.com/app" },
];

export function AskAi({ prompt, reviewCount }: { prompt: string; reviewCount: number }) {
  const [msg, setMsg] = useState<string | null>(null);

  async function open(tool: (typeof TOOLS)[number]) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      /* clipboard can be blocked; the prefilled link may still work */
    }
    const encoded = encodeURIComponent(prompt);
    const prefill = tool.id !== "gemini" && encoded.length <= URL_LIMIT;
    window.open(tool.url(prefill ? encoded : undefined), "_blank", "noopener");
    setMsg(
      prefill
        ? `${tool.label} opened with your question filled in.`
        : copied
          ? `Copied! In ${tool.label}, click the message box, paste (Ctrl+V) and press Enter.`
          : `Couldn't copy automatically. Please try “Copy text” instead.`,
    );
  }

  async function copyOnly() {
    try {
      await navigator.clipboard.writeText(prompt);
      setMsg("Copied! You can now paste it into any AI chat.");
    } catch {
      setMsg("Your browser didn't allow copying. Please try again.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => open(t)} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-brand">
            Ask {t.label} ↗
          </button>
        ))}
        <button onClick={copyOnly} className="rounded-md px-3 py-1.5 text-sm text-brand hover:underline">Copy text</button>
      </div>
      <p className="text-xs text-muted mt-2">
        {msg ?? `Shares ${reviewCount} reviews from what you're viewing (without guest names) with the AI you pick.`}
      </p>
    </div>
  );
}
