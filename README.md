# Azzurro Hotels: Guest Review Insights

Collects public Booking.com guest reviews for four Azzurro Hotels properties and turns them into a simple dashboard for the operations team: weekly rating vs last week, a per-property breakdown, a searchable review feed, positive/negative trends and recurring operational topics (cleanliness, check-in, noise …).

**Live demo:** _add Vercel URL here_ · **Sample data:** [`data/sample/reviews.json`](data/sample/reviews.json) (1,329 reviews collected 25 Nov 2026)

| Property | Booking.com page |
|---|---|
| Olympic Hotel Paddington | `olympic-paddington` |
| Potts Point | `venus-potts-point-sydney` |
| Central Sydney | `venus-surry-hills` |
| Darling Harbour | `chateau-de-venus` |

---

## Quick start (local, no database needed)

```bash
npm install
npm run dev          # http://localhost:3000, reads data/sample/reviews.json
```

### Collect fresh reviews

```bash
npx playwright install chromium          # one-off (or set BROWSER_CHANNEL=msedge / chrome to use an installed browser)
npm run scrape                           # incremental: only pages until it reaches reviews it already has
npm run scrape -- --property=paddington  # one property
npm run scrape -- --full                 # ignore known reviews (backfill)
```

A browser window opens while it runs (see [Why a visible browser](#why-a-visible-browser)).

### With MongoDB (what the hosted demo uses)

```bash
cp .env.example .env.local   # set MONGODB_URI
npm run seed                 # load the sample data into MongoDB (safe to re-run)
npm run scrape               # new reviews now go to MongoDB *and* the JSON snapshot
npm run dev
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build`.

---

## Architecture

```
  GitHub Actions (daily cron)                 MongoDB Atlas                Vercel
  ┌─────────────────────────┐   upsert by id  ┌───────────────┐  read  ┌──────────────────────┐
  │ scraper/run.ts          │ ──────────────▶ │ reviews       │ ─────▶ │ Next.js dashboard    │
  │ Playwright → Booking.com│                 │ scrape_runs   │        │ /  /reviews  /topics │
  └─────────────────────────┘                 └───────────────┘        └──────────────────────┘
            │ also writes                                                  ▲ falls back to
            ▼                                                              │ (no MONGODB_URI)
     data/sample/reviews.json, scrape-runs.json  ──────────────────────────┘
```

**The scraper and the dashboard are fully separate.** The browser only runs in the scheduled job, never when someone opens the dashboard. Page loads stay fast, Booking.com sees one visitor per day rather than one per dashboard user, and if collection breaks the dashboard keeps showing the last good data with a warning.

| Path | Purpose |
|---|---|
| `scraper/run.ts` | Browser flow, parsing, retries, change detection, run logging |
| `scraper/store.ts` | Upserts to MongoDB + JSON snapshot, known-ID lookup for incremental runs |
| `lib/classify.ts` | Topic keyword rules + sentiment bands |
| `lib/metrics.ts` | Week/period logic (Sydney time), KPIs, insight sentences |
| `lib/data.ts` | Reads MongoDB or the snapshot; cached for 1 hour |
| `app/` | Dashboard pages (Next.js App Router, server components) |
| `.github/workflows/scrape.yml` | Daily collection job |

Stack: TypeScript, Next.js 16, Tailwind, Recharts, Playwright, MongoDB (official driver), zod.

---

## How reviews are collected

Booking.com has no public review API, and its old `reviewlist.html` endpoint now returns 404. Notes from the investigation are in [`docs/scraping-notes.md`](docs/scraping-notes.md).

The scraper behaves like a visitor reading reviews:

1. Opens the public property page in a real browser (Playwright).
2. Clicks **Read all reviews** and sorts by **Newest first**.
3. Clicks **Next page** with a polite 1.5–3 s pause between pages.
4. **Reads the review data the page itself loads** (the `ReviewList` JSON response the page requests when you change page). This gives clean, structured fields instead of scraping text out of HTML.
5. **Fallback:** if that JSON stops appearing, it reads the visible review cards using their stable `data-testid` attributes. The run is then marked `degraded` so someone checks it.

It does **not** call Booking's internal API directly, log in, or use cookies or credentials.

**Fields collected:** Booking review ID, property, score (/10), review date, title, liked text, disliked text, language, guest first name, country, traveller type (solo / couple / family …), room type, nights, check-in/out dates, the hotel's reply, helpful votes.

### Reliability and data quality

| Concern | How it's handled |
|---|---|
| **Duplicates** | Booking's own review ID is the key. A unique index in MongoDB plus upserts mean re-running never duplicates. DOM-fallback reviews get a SHA-256 content hash as their ID. |
| **New reviews** | Newest-first + incremental: it stops at the first page with no unseen reviews. A daily re-run usually reads 1 page per property. |
| **Edited reviews / new hotel replies** | Upserts refresh the fields of reviews already stored and keep `firstSeenAt`. |
| **Temporary failures** | 3 attempts per property with exponential backoff (5 s, 10 s), a fresh browser context each attempt, and one property failing doesn't stop the others. |
| **Page changes** | Every review is validated with a zod schema. If a page yields 0 valid reviews, >20 % invalid, or the JSON is missing, the run is marked `degraded`/`failed` and the page HTML + screenshot are saved to `data/debug/` (uploaded as a CI artefact). |
| **Visibility** | Every run is logged in `scrape_runs`. The dashboard header shows "Data last updated …" and a warning badge if the latest run for any property wasn't OK. |
| **Runaway runs** | `SCRAPE_MAX_PAGES` (default 40 pages = 400 reviews) per property per run. |
| **Atomic writes** | The JSON snapshot is written to a temp file and then renamed, so a crash can't corrupt it. |

### Why a visible browser

In testing, Booking.com returned an **empty review list to headless browsers** but the normal list to a regular browser window. Rather than try to disguise the scraper, it runs a normal (headed) browser: on a desktop that means a window opens, and in CI it runs inside a virtual display (`xvfb-run`). Set `HEADLESS=1` to try headless.

### Limitations

- **Terms of service.** Automated collection may conflict with Booking.com's terms. This is a proof of concept for internal analysis at low volume. For production, Booking's Connectivity/partner APIs (available to the property owner through the extranet) or a review aggregator would be the robust choice.
- **Booking lists a subset of reviews.** For example, Paddington showed "129 reviews" in its score badge. All metrics describe the reviews Booking lists publicly.
- **Fragility.** Booking can change its page or block automated browsers at any time. Change detection makes this visible quickly but can't prevent it. CI runners use datacenter IPs that may get blocked more often. Running `npm run scrape` locally writes to the same database.
- **History depth.** The first run collected the newest 400 reviews for the three larger properties (page cap). Increase `SCRAPE_MAX_PAGES` and run `--full` for more history.

---

## Insights methodology

**Sentiment** comes from the guest's own score: **positive ≥ 8**, **mixed 6–7.9**, **negative < 6**. It's simple, transparent and matches how Booking presents scores.

**Topics** come from keyword rules (`lib/classify.ts`) for: Cleanliness, Check-in experience, Staff & service, Noise, Facilities, Location, Room condition, Bathroom & hot water, Value for money.

The key design choice: **Booking already splits every review into "liked" and "disliked".** Keywords are matched separately in each half:

- topic word in *disliked* → **complaint** about that topic
- topic word in *liked* → **praise**

So "Great location, but the room was dirty" counts as location = praise, cleanliness = complaint, without any NLP model. "Nothing" / "N/A" / "no complaints" in the disliked box is ignored. The title is added to the side matching the score.

**Insight sentences** such as *"67% of negative reviews this week mentioned facilities (2 of 3) (up from 29%)"* always show the raw count, compare against the previous period, and carry a **small sample** tag when based on fewer than 5 reviews. 2 out of 3 is not a trend.

**Limitations of the method**

- English keywords only. Reviews in other languages (~1/3) mostly get no topic. The AI summary and the translate link cover these. Rating-only reviews (no text) get no topic either, though they still count in averages.
- Keywords don't understand context ("not dirty at all" → cleanliness complaint is possible, though rare in the *disliked* box). Broad words like "room" over-match.
- One review can mention several topics, so topic shares don't add up to 100 %.

### AI summary: "where should the team pay attention?"

**Ask AI buttons (no API key).** The Overview page has **Ask ChatGPT / Claude / Gemini** buttons. They build a prompt from the reviews currently filtered and copy it to the clipboard:
- our computed statistics, which the AI is told to trust and not invent numbers beyond;
- up to 80 review texts, without guest names.

Each button then opens the assistant. ChatGPT and Claude get the prompt prefilled when it fits in a URL; otherwise you paste it. The answer is a summary, up to 4 prioritised issues with evidence and a suggested action, and what's going well. **Why this way:** no keys, no cost, no new failure point in the app, and staff use the assistant their company already approves.

**Ask AI page (`/ask`, bring your own key).** Staff can ask any question about the filtered reviews, or tap a suggestion:
- "What issues did guests face?"
- "What should we improve first?"
- "Which property needs the most attention?"
- "Any safety or hygiene problems?"
- "Draft a reply to the latest negative review", and others.

In **⚙ AI settings** you choose Google Gemini, Anthropic Claude or OpenAI, paste your own API key and optionally change the model:
- **The key is stored only in your browser** (`localStorage`). The browser calls the provider directly (`lib/llm-browser.ts`), so keys never touch our server or the deployed site. Each person's usage is billed to their own account.
- Claude goes through the official `@anthropic-ai/sdk` in browser mode (`claude-opus-5-5` by default). It caches the review data across questions and uses server-side `fallbacks` in case the model declines.
- Gemini and OpenAI use their REST APIs.
- Trade-off: a key in browser storage can be read by anyone using that browser profile and by extensions. That's acceptable for an internal tool, and the settings panel warns about it. A company-wide deployment would instead proxy calls through a server with one managed key.

**Optional built-in summary (Gemini API).** Set `GEMINI_API_KEY` and the same analysis appears directly on the page (`lib/ai.ts`):
- structured JSON output, low temperature;
- cached per exact input for an hour, so page views don't re-bill;
- if the call fails, the card says so and the rest of the dashboard is unaffected.

An LLM also reads non-English reviews, which the keyword rules can't.

### Non-English reviews
About a third of reviews (~450) aren't in English. They show a language tag and a **Translate to English (Google Translate)** link. The text is sent to Google only when someone clicks, and no key is needed.

### Dashboard design choices (for non-technical users)

- Plain-language headings ("How are guests rating us?"), a one-line explanation under every number, and colour (green / amber / red) that matches Booking's score bands.
- Filters are clickable chips stored in the URL, so a filtered view can be bookmarked or shared in Slack/email.
- Every insight and table cell links to the reviews behind it, so the numbers can be checked.
- **Extra KPIs:** "No hotel reply" count for negative reviews (an actionable to-do list), and the top complaint per property.
- "This week" = Monday–Sunday, **Sydney time**.

---

## Hosting (demo setup)

1. **MongoDB Atlas (free M0):** create a cluster and two database users, `dashboard` (read-only) and `scraper` (read-write). Network access is `0.0.0.0/0`, because Vercel and GitHub runners have no fixed IPs. The read-only user limits the impact if that connection string leaks.
2. `MONGODB_URI=<scraper user> npm run seed`.
3. **Vercel:** import the GitHub repo and set `MONGODB_URI` to the read-only user's connection string.
4. **GitHub:** add the repository secret `MONGODB_URI_WRITE` (scraper user). The `Collect reviews` workflow runs daily and can also be started manually from the Actions tab.

No secrets are committed. `.env*` is gitignored and only `.env.example` is tracked.
