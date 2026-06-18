# SpendSentry Web — Build-Spec Docs (Index)

Complete build specification for rebuilding the **SpendSentry** web frontend from scratch —
a Toss-style Korean expense-compliance chatbot (지출결의서 컴플라이언스). This bundle is
**frontend-only**; the FastAPI backend (`api/main.py`, model `claude-haiku-4-5`) is treated as
a black box defined entirely by the API contract in `03-API-CONTRACT.md`.

These 8 docs together specify: the project scaffold and exact dependency versions, the Toss
design tokens, every component, every user flow as state transitions, the full HTTP/streaming
API contract, the complete TypeScript model, every Korean string verbatim, the client state
machine, accessibility, and the responsive `max-w-3xl` layout.

> Read these docs as authoritative over `web/DESIGN.md` (older notes that `01-DESIGN-SYSTEM.md`
> supersedes).

---

## Recommended reading order

Read in numeric order. The dependency chain is **tokens → types → api → components → page → copy**,
which is exactly the build order in `00-OVERVIEW.md` §8.

1. **`00-OVERVIEW.md`** — Product overview, exact tech stack + versions, full `web/` file tree,
   every config file's meaning (`next.config.js`, `tsconfig.json`, `postcss.config.js`,
   `layout.tsx`), env vars, npm scripts, a Replit quickstart, and the build order.
2. **`01-DESIGN-SYSTEM.md`** — Toss design tokens: color palette, the `4xl=28px` radius, `toss`/`sheet`
   shadows, Pretendard font, type scale, framer-motion spring params, and the `globals.css`
   utilities (`.skeleton`, `.no-scrollbar`, `.pb-safe`). The visual contract.
3. **`02-ARCHITECTURE-AND-STATE.md`** — App Router shell, single-origin `/api` proxy, responsive
   container model, and the complete client state machine in `app/page.tsx` (state/refs,
   handlers, `AbortController` lifecycle, conditional render tree).
4. **`03-API-CONTRACT.md`** — The HTTP contract: `POST /api/chat` (plain-text token streaming),
   `POST /api/verify-receipt` (multipart), `GET /api/health`; request/response JSON, the exact
   client read loop, error handling, and base-URL resolution.
5. **`04-COMPONENTS.md`** — Build spec for every component: inline Header (+ go-home), Onboarding,
   Composer (incl. the `sr-only` attach input), ChatBubble, Markdown, TypingDots, ReceiptSheet
   (full modal a11y), plus the in-page verdict chip, message renderer, and skeleton.
6. **`05-FLOWS-AND-SCREENS.md`** — The two screens and every flow as explicit state transitions:
   onboarding, category ask, free-text chat, attach → verify → auto bottom sheet,
   PASS/FAIL/REVIEW, error + retry, stop, go-home; plus the state→indicator table and wireframes.
7. **`06-COPY-KO.md`** — Every user-facing Korean string verbatim (metadata, header, onboarding
   presets, composer, chip/error/loading copy, sheet, severity meta, and the dynamic LLM-context
   strings), with a glyph/punctuation cheat sheet.
8. **`07-TYPES.md`** — The complete `lib/types.ts`: `Severity`, `SEVERITY_META`, `Violation`,
   `ReceiptData`, `VerifyResult`, `ChatTurn`, and the `Message` discriminated union, plus the
   backend↔frontend mirror map.
9. **`08-DETERMINISTIC-ENGINE.md`** — Reproducible **working code** for the backend's 3 core
   optimizations: deterministic rule routing (LangGraph), the full R-01~R-12 rule engine, and
   image downscaling. Embeds the entire `graph/` package verbatim with a verification checklist.

> **Doc map.** **00**=Overview · **01**=Design System · **02**=Architecture & State · **03**=API Contract ·
> **04**=Components · **05**=Flows & Screens · **06**=Copy (KO) · **07**=Types · **08**=Deterministic Engine. All internal
> cross-references use these exact filenames.

---

## How to use at the hackathon (Replit)

The goal is a single public origin serving both UI and `/api`. Paste/build in dependency order so
nothing references a file that doesn't exist yet.

### What to build first (in order)

1. **Scaffold + configs (`00-OVERVIEW.md`).** Run the `create-next-app@14.2.5` command from §7,
   install the exact deps (`framer-motion`, `react-markdown`, `remark-gfm` + the dev deps), then
   overwrite `next.config.js`, `tsconfig.json`, `postcss.config.js`, and `app/layout.tsx` with the
   verbatim blocks in §4. Set `BACKEND_URL` (single-origin, recommended) or `NEXT_PUBLIC_API_URL`
   (split deploy) in **Replit Secrets**, not committed files.
2. **Design tokens (`01-DESIGN-SYSTEM.md`).** Paste the `theme.extend` block into `tailwind.config.ts`
   and the Pretendard `@import` + base reset + `.skeleton`/`.no-scrollbar`/`.pb-safe` into
   `app/globals.css`. **Important:** `tailwind.config.ts` also needs the `content` glob
   `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]` or Tailwind's JIT will emit no classes.
   `01-DESIGN-SYSTEM.md` reproduces the full `tailwind.config.ts` (wrapper + `content` + `theme.extend`).
3. **Types (`07-TYPES.md`).** Paste the entire canonical block into `lib/types.ts` (it is the whole
   file). Everything else imports from here.
4. **API client (`03-API-CONTRACT.md`).** Implement `lib/api.ts`: `streamChat` (reader + one
   `TextDecoder({stream:true})`, never `res.text()`), `verifyReceipt` (FormData field `file`, no
   manual Content-Type), and `const API = process.env.NEXT_PUBLIC_API_URL ?? ""`.
5. **Components (`04-COMPONENTS.md`).** Build `TypingDots`, `Markdown`, `ChatBubble`, `Composer`
   (mind the `sr-only` + `tabIndex={-1}` file input), `Onboarding`, then `ReceiptSheet`.
6. **Page + state (`02-ARCHITECTURE-AND-STATE.md` + `05-FLOWS-AND-SCREENS.md`).** Wire `app/page.tsx`:
   state/refs, the inline header app-bar, `handleSubmit` branch matrix, `callChat` streaming,
   `goHome`, `stop`, the render tree, and the `aria-live` region.
7. **Copy (`06-COPY-KO.md`).** As you build steps 5–6, paste every Korean string verbatim —
   including the exact glyphs (`·` U+00B7, `—` U+2014, `＋` U+FF0B, `↑`, `✕`, `⚠️`, `₩`). Do not
   paraphrase or re-translate.

### What to paste, in what order

`tailwind.config.ts` theme + `globals.css` → `lib/types.ts` (whole file) → `lib/api.ts` →
component files → `app/page.tsx` → Korean copy threaded through the last two.

### Run

```bash
npm run dev    # → http://localhost:3000 (Replit exposes the webview on port 3000)
```

If running the FastAPI backend in the same Repl, start it on `:8000` first
(`uvicorn api.main:app --port 8000`) so the `/api` rewrite target resolves. Hit `GET /api/health`
to confirm the backend is up and `key_set: true`.
