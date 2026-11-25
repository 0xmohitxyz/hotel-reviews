"use client";

/**
 * Bring-your-own-key AI calls, made directly from the user's browser.
 * The key is stored in localStorage on this device only and is sent only to
 * the chosen provider; it never reaches our server.
 */
import Anthropic from "@anthropic-ai/sdk";

export type Provider = "gemini" | "claude" | "openai";

export type AiSettings = {
  provider: Provider;
  keys: Partial<Record<Provider, string>>;
  models: Record<Provider, string>;
};

export const PROVIDERS: { id: Provider; label: string; keyHint: string; keyUrl: string }[] = [
  { id: "gemini", label: "Google Gemini", keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "claude", label: "Anthropic Claude", keyHint: "sk-ant-…", keyUrl: "https://platform.claude.com/settings/keys" },
  { id: "openai", label: "OpenAI", keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys" },
];

export const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: "gemini-3.8-flash",
  claude: "claude-opus-5-5",
  openai: "gpt-5-mini",
};

const BAD_KEY = "The access key wasn't accepted. Check it in AI settings, or ask your manager for the current key.";
const isKeyError = (status: number, msg = "") => status === 401 || status === 403 || /api key/i.test(msg);

const STORAGE_KEY = "azzurro.ai-settings.v1";

const CHANGE_EVENT = "azzurro-ai-settings";

export function parseSettings(raw: string | null): AiSettings {
  const fallback: AiSettings = { provider: "gemini", keys: {}, models: { ...DEFAULT_MODELS } };
  try {
    const s = JSON.parse(raw || "null");
    return s ? { ...fallback, ...s, models: { ...DEFAULT_MODELS, ...s.models } } : fallback;
  } catch {
    return fallback;
  }
}

/** For useSyncExternalStore: raw stored string (null on the server / when unset). */
export const readRaw = () => localStorage.getItem(STORAGE_KEY);
export const readRawServer = () => null;
export function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

export function saveSettings(s: AiSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Ask one question. `context` (rules + stats + reviews) is the same for every question on the page. */
export async function askLLM(s: AiSettings, system: string, context: string, question: string): Promise<string> {
  const key = s.keys[s.provider]?.trim();
  if (!key) throw new Error("No access key saved for this AI service. Ask your manager or IT team for the team's key and enter it in AI settings.");
  const model = s.models[s.provider] || DEFAULT_MODELS[s.provider];

  if (s.provider === "claude") {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      return await askClaude(client, model, system, context, question);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error(BAD_KEY);
      if (e instanceof Anthropic.NotFoundError) throw new Error(`Claude model "${model}" was not found. Check the model name in AI settings.`);
      if (e instanceof Anthropic.RateLimitError) throw new Error("Claude rate limit reached. Wait a minute and try again.");
      if (e instanceof Anthropic.APIError) throw new Error(`Claude error ${e.status ?? ""}: ${e.message}`);
      throw e;
    }
  }
  return askOther(s.provider, key, model, system, context, question);
}

async function askClaude(client: Anthropic, model: string, system: string, context: string, question: string) {
  {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if the model declines, the API retries on a suitable fallback model
      output_config: { effort: "medium" },
      // The review data is identical across questions, so cache it.
      system: [{ type: "text", text: `${system}\n\n${context}`, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: question }],
    });
    if (res.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
}

async function askOther(provider: Provider, key: string, model: string, system: string, context: string, question: string) {
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${system}\n\n${context}` },
          { role: "user", content: question },
        ],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && isKeyError(res.status, json?.error?.message)) throw new Error(BAD_KEY);
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json?.error?.message ?? res.statusText}`);
    return (json.choices?.[0]?.message?.content ?? "").trim();
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${system}\n\n${context}` }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && isKeyError(res.status, json?.error?.message)) throw new Error(BAD_KEY);
  if (res.status === 404) throw new Error(`The AI model "${model}" isn't available. Ask your manager or IT to update the model under AI settings → Advanced.`);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? res.statusText}`);
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no answer (${json?.candidates?.[0]?.finishReason ?? "unknown reason"}).`);
  return text.trim();
}
