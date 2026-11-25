/**
 * Booking.com language codes. Mostly ISO 639-1, plus a few regional codes
 * of its own (seen in our data): xu = English (US), xt = Chinese (Traditional),
 * xb = Portuguese (Brazil), xa = Spanish (Argentina), xm = Spanish (Mexico).
 */
const NAMES: Record<string, string> = {
  en: "English", xu: "English", fr: "French", es: "Spanish", xa: "Spanish", xm: "Spanish", de: "German",
  ja: "Japanese", it: "Italian", zh: "Chinese", xt: "Chinese", nl: "Dutch", ru: "Russian", ko: "Korean",
  pl: "Polish", pt: "Portuguese", xb: "Portuguese", da: "Danish", no: "Norwegian", sv: "Swedish",
  cs: "Czech", fi: "Finnish", ca: "Catalan", vi: "Vietnamese", ar: "Arabic", sl: "Slovenian",
  he: "Hebrew", lv: "Latvian", hu: "Hungarian",
};

export const isEnglish = (lang: string | null) => !lang || lang === "en" || lang === "xu";
export const languageName = (lang: string | null) => (lang ? (NAMES[lang] ?? lang) : "Unknown");

/** Opens Google Translate (auto-detect → English). Nothing is sent until the user clicks. */
export function googleTranslateUrl(text: string) {
  const q = new URLSearchParams({ sl: "auto", tl: "en", op: "translate", text: text.slice(0, 4500) });
  return `https://translate.google.com/?${q}`;
}
