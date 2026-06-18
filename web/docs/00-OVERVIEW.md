# SpendSentry Web — Product & Build Overview

SpendSentry is a Toss-style Korean **expense-compliance chatbot** (지출결의서 컴플라이언스). This document is the entry point for rebuilding the **web frontend** from scratch: it covers the product, the exact tech stack with versions, the full file tree, every config file's meaning, environment variables, npm scripts, a Replit quickstart, and the recommended build order across sibling docs.

> **Scope guard — THIS BUNDLE IS FRONTEND-ONLY.** A separate FastAPI backend (`api/main.py`, Anthropic SDK, model `claude-haiku-4-5`) and a legacy Streamlit app (`app.py`) exist in the parent repo, but **you are NOT rebuilding them here.** The frontend talks to the backend purely over HTTP at `/api/*`. Treat the backend as a black box defined by its API contract (see `03-API-CONTRACT.md`).

## Source files specified

This document is derived from and authoritative for these files:

- `web/package.json` — deps, versions, npm scripts
- `web/next.config.js` — `/api` → backend rewrite (single-origin proxy)
- `web/tsconfig.json` — TS compiler options + `@/*` path alias
- `web/postcss.config.js` — Tailwind + autoprefixer
- `web/README.md` — run instructions, architecture sketch
- `web/env.local.example` — env var template
- `web/app/layout.tsx` — RootLayout (html shell, metadata, viewport)

---

## 1. Product overview

SpendSentry presents a **single-column mobile-first chat interface** (Toss / 토스 design language) where an employee can:

1. **Ask expense-policy questions** in natural Korean (e.g. "식대 한도가 얼마야?"). Answers stream token-by-token from the backend's Anthropic-powered chat endpoint and render as Markdown (with GFM tables).
2. **Verify a receipt image** (영수증 검증). The user attaches a PNG/JPEG; the backend runs deterministic OCR + a rule engine and returns a structured **verdict** (`PASS` / `FAIL` / `REVIEW`) plus any policy **violations**. The result animates up from the bottom as a **bottom sheet** (바텀 시트) with a verdict banner, metric grid, optional taxi route, and per-violation cards.

The UX leans on Toss-style micro-interactions: spring-animated message bubbles, a drag-to-dismiss bottom sheet, a 3-dot typing indicator while streaming, skeleton shimmer, generous whitespace, large typography, and Toss Blue (`#3182f6`).

The brand subtitle shown in the header is **`Sentri AI 컴플라이언스`** (the document `<title>` is `SpendSentry`, `<meta description>` is `Sentri AI 지출결의서 컴플라이언스`). All Korean UI copy is catalogued verbatim in `06-COPY-KO.md` — never paraphrase or re-translate it.

### High-level architecture (single origin)

```
[Next.js 14 App Router + Framer Motion]  ──HTTP /api/*──▶  [FastAPI :8000]  ──▶  graph/ rule engine (Python)
  spring bubbles / bottom sheet / typing dots                /api/verify-receipt, /api/chat, /api/health
```

The browser **always calls relative `/api/...`**. `next.config.js` rewrites those to the backend so the whole app is one public origin (one tunnel/URL is enough). For split deploys, `lib/api.ts` can prepend an absolute base via `NEXT_PUBLIC_API_URL` instead (see §5 and `03-API-CONTRACT.md`).

---

## 2. Exact tech stack (with versions)

Pull these versions verbatim from `package.json` — do not bump them.

### Runtime dependencies

| Package | Version (package.json) | Role |
|---|---|---|
| `next` | `14.2.5` | Framework — **App Router** (`app/` dir), `reactStrictMode: true` |
| `react` | `^18.3.1` | UI library |
| `react-dom` | `^18.3.1` | DOM renderer |
| `framer-motion` | `^11.3.19` | Spring bubbles, bottom-sheet drag/animate, typing dots, onboarding transitions |
| `react-markdown` | `^9.0.1` | Renders streamed assistant answers as Markdown |
| `remark-gfm` | `^4.0.0` | GitHub-Flavored Markdown plugin (tables, etc.) for `react-markdown` |

### Dev dependencies

| Package | Version | Role |
|---|---|---|
| `typescript` | `^5.5.3` | Typed source |
| `@types/node` | `^20.14.0` | Node types |
| `@types/react` | `^18.3.3` | React types |
| `@types/react-dom` | `^18.3.0` | React-DOM types |
| `tailwindcss` | `^3.4.6` | Utility CSS (design tokens in `tailwind.config.ts`) |
| `autoprefixer` | `^10.4.19` | PostCSS vendor-prefixing |
| `postcss` | `^8.4.39` | CSS pipeline |

> Note: `package.json` does **not** declare an `eslint` / `eslint-config-next` dependency even though a `lint` script exists; `next lint` will offer to install ESLint on first run. The fonts (**Pretendard**) are loaded via a CDN `@import` in `globals.css`, **not** via `next/font` or an npm package.

### Package identity

```json
{ "name": "spendsentry-web", "version": "0.1.0", "private": true }
```

---

## 3. Folder & file tree (`web/`)

```
web/
├── app/
│   ├── layout.tsx          # RootLayout: <html lang="ko">, metadata, viewport, body bg
│   ├── page.tsx            # Home (client): chat state, streamChat + verifyReceipt orchestration,
│   │                       #   inline <header> app-bar, scroll area, message list, ReceiptSheet
│   └── globals.css         # Tailwind layers + Pretendard @import + .skeleton/.no-scrollbar/.pb-safe
├── components/
│   ├── ChatBubble.tsx      # Spring-animated message bubble (user blue / assistant white)
│   ├── Composer.tsx        # Bottom input bar (forwardRef → openFilePicker), attach + send/stop
│   ├── Markdown.tsx        # memo'd react-markdown + remark-gfm renderer (Tailwind-styled elements)
│   ├── Onboarding.tsx      # Empty-state: 4-category grid + receipt CTA
│   ├── ReceiptSheet.tsx    # Bottom-sheet modal: verdict banner, metrics, taxi route, violation cards
│   └── TypingDots.tsx      # 3-dot bouncing typing indicator (role="status")
├── lib/
│   ├── api.ts              # verifyReceipt(), streamChat() — relative /api calls + AbortController
│   └── types.ts            # Severity, SEVERITY_META, Violation, ReceiptData, VerifyResult, ChatTurn, Message
├── docs/                   # ← these build-spec markdown docs
├── next.config.js          # /api/:path* → BACKEND_URL rewrite, reactStrictMode
├── tailwind.config.ts      # Toss color palette, borderRadius 4xl, boxShadow toss/sheet, font Pretendard
├── postcss.config.js       # { tailwindcss, autoprefixer }
├── tsconfig.json           # strict TS, moduleResolution "bundler", @/* path alias
├── package.json            # deps + scripts
├── env.local.example       # NEXT_PUBLIC_API_URL template
└── README.md               # run instructions (Korean)
```

> **Casing/naming gotchas:** the file is `TypingDots.tsx` (exact PascalCase). There is **no** `Header.tsx` — the app-bar is inline in `app/page.tsx`. `next-env.d.ts` and `.next/` are auto-generated by Next on first run; do not author them.

Files generated automatically (not committed by hand): `next-env.d.ts`, `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`.

---

## 4. Config files — what each one means

### `next.config.js` — single-origin `/api` proxy

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
module.exports = nextConfig;
```

- **`reactStrictMode: true`** — strict double-invoke in dev (effects run twice). Code must be idempotent (matters for `AbortController` / objectURL cleanup in `Composer`/`page.tsx`).
- **`rewrites()`** — every request to `/api/*` is proxied server-side to `${BACKEND_URL}/api/*`, default `http://localhost:8000`. This is what makes the app a **single origin**: the browser only ever sees relative `/api`, so one public URL (a tunnel) serves both UI and API, and there are no CORS preflights.

### `tsconfig.json`

- `"strict": true`, `"noEmit": true` (Next/SWC compiles), `"jsx": "preserve"`.
- `"module": "esnext"`, `"moduleResolution": "bundler"`, `"isolatedModules": true`, `"resolveJsonModule": true`, `"allowJs": true`, `"skipLibCheck": true`, `"incremental": true`.
- `"lib": ["dom", "dom.iterable", "esnext"]`.
- **Path alias:** `"paths": { "@/*": ["./*"] }` → import from web root, e.g. `import { streamChat } from "@/lib/api"`, `import ChatBubble from "@/components/ChatBubble"`.
- `"plugins": [{ "name": "next" }]`; `include` covers `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts`; `exclude` is `node_modules`.

### `postcss.config.js`

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Tailwind processes utility classes; autoprefixer adds vendor prefixes. (Full token definitions live in `tailwind.config.ts` — see `01-DESIGN-SYSTEM.md`.)

### `app/layout.tsx` — RootLayout (server component, no `"use client"`)

```tsx
export const metadata: Metadata = {
  title: "SpendSentry",
  description: "Sentri AI 지출결의서 컴플라이언스",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale intentionally omitted → pinch-zoom allowed (WCAG 1.4.4)
  viewportFit: "cover", // notch / home-bar safe areas
};
```

- `<html lang="ko">`.
- `<body className="font-sans bg-toss-bg">` — `font-sans` resolves to Pretendard (configured in `tailwind.config.ts`); `bg-toss-bg` is `#f2f4f6`.
- Imports `./globals.css`.
- **Do not** set `maximumScale` / `userScalable: false` — pinch-zoom must stay enabled for accessibility. `viewportFit: "cover"` pairs with the `.pb-safe` safe-area utility used by the Composer.

---

## 5. Environment variables

| Var | Where used | Default | Meaning |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser (`lib/api.ts`) | `""` (empty = same-origin → relative `/api`) | Optional absolute base for split deploys (frontend and backend on different origins). When empty, requests stay relative and rely on the Next rewrite. |
| `BACKEND_URL` | Server (`next.config.js` rewrite) | `http://localhost:8000` | Upstream FastAPI base the `/api/*` rewrite proxies to. |

`env.local.example` (copy to `.env.local`):

```bash
# FastAPI 백엔드 주소 (복사: cp .env.local.example .env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Two valid wiring modes.** (a) **Single-origin (recommended):** leave `NEXT_PUBLIC_API_URL` empty and let `BACKEND_URL` + the rewrite proxy `/api`. (b) **Split deploy:** set `NEXT_PUBLIC_API_URL` to the backend's absolute URL so the browser calls it directly (requires backend CORS). The example file demonstrates mode (b); for local dev with the rewrite you can simply omit it. `NEXT_PUBLIC_*` is the only prefix exposed to client code.

---

## 6. npm scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Dev server with HMR → http://localhost:3000 |
| `build` | `next build` | Production build (`.next/`) |
| `start` | `next start` | Serve the production build |
| `lint` | `next lint` | ESLint (Next config; installs ESLint on first run) |

---

## 7. REPLIT QUICKSTART

Goal: stand up the SpendSentry frontend in Replit and point it at the backend. Two paths — scaffold fresh, or wire into an existing Next app.

### Step 1 — Scaffold a Next 14 App Router + TS + Tailwind project

```bash
npx create-next-app@14.2.5 spendsentry-web \
  --typescript --tailwind --app --eslint \
  --src-dir false --import-alias "@/*"
cd spendsentry-web
```

This gives you `app/`, Tailwind + PostCSS configured, the `@/*` alias, and `reactStrictMode`. If the scaffolder is unavailable, hand-create the tree from §3 and the configs from §4.

### Step 2 — Install the exact runtime + dev deps

```bash
npm install framer-motion@^11.3.19 react-markdown@^9.0.1 remark-gfm@^4.0.0
# next@14.2.5 react@^18.3.1 react-dom@^18.3.1 come from the scaffold
npm install -D tailwindcss@^3.4.6 autoprefixer@^10.4.19 postcss@^8.4.39 \
  typescript@^5.5.3 @types/node@^20.14.0 @types/react@^18.3.3 @types/react-dom@^18.3.0
```

### Step 3 — Apply the configs from §4

Overwrite the scaffolded `next.config.js`, `tsconfig.json`, and `postcss.config.js` with the versions in §4. Replace `tailwind.config.ts` and `app/globals.css` with the design-system definitions from `01-DESIGN-SYSTEM.md` (Toss palette, `4xl` radius, `toss`/`sheet` shadows, Pretendard, `.skeleton`/`.no-scrollbar`/`.pb-safe`). Replace `app/layout.tsx` with §4's RootLayout.

### Step 4 — Wire the `/api` proxy (or point at the backend)

- **Single-origin:** keep `next.config.js`'s rewrite. Set `BACKEND_URL` (Replit Secrets) to the FastAPI URL, or leave it for the `http://localhost:8000` default if the backend runs in the same Repl.
- **Split deploy:** set `NEXT_PUBLIC_API_URL` to the backend's absolute URL in Replit Secrets; `lib/api.ts` will prepend it. Backend must allow CORS.

```bash
cp env.local.example .env.local   # then edit, or use Replit Secrets
```

### Step 5 — Build the components & libs, then run

Implement `lib/types.ts`, `lib/api.ts`, the components, and `app/page.tsx` per the sibling docs (see §8). Then:

```bash
npm run dev    # → http://localhost:3000  (Replit exposes the webview on port 3000)
```

> Replit notes: bind dev to the forwarded port (Replit maps the webview automatically for `next dev` on 3000). Put `ANTHROPIC_API_KEY`, `BACKEND_URL` / `NEXT_PUBLIC_API_URL` in **Secrets**, not in committed files. If running the FastAPI backend in the same Repl, start it on `:8000` first (`uvicorn api.main:app --port 8000`) so the rewrite target resolves.

---

## 8. Build order checklist (sibling docs)

Reconstruct the frontend in this sequence; each step references its detailed sibling spec:

1. **`00-OVERVIEW.md`** (this doc) — scaffold project, install exact deps, apply `next.config.js` / `tsconfig.json` / `postcss.config.js` / `layout.tsx`, set env vars.
2. **`01-DESIGN-SYSTEM.md`** — `tailwind.config.ts` tokens (Toss palette, `4xl=28px` radius, `toss`/`sheet` shadows, Pretendard) and `app/globals.css` (`.skeleton`, `.no-scrollbar`, `.pb-safe`).
3. **`07-TYPES.md`** — `lib/types.ts`: `Severity` (`심각`/`주의`/`누락`), `SEVERITY_META` (single source of truth for severity icon/label/colors), `Violation`, `ReceiptData`, `VerifyResult`, `ChatTurn`, `Message`.
4. **`03-API-CONTRACT.md`** — `lib/api.ts`: `verifyReceipt()` (multipart), `streamChat()` (plain-text token stream read via reader/`TextDecoder`), `AbortController` cancellation, base-URL resolution from `NEXT_PUBLIC_API_URL`.
5. **`04-COMPONENTS.md`** — `ChatBubble`, `TypingDots`, `Markdown`, `Composer` (`forwardRef` → `openFilePicker`), `Onboarding`, `ReceiptSheet` (focus trap, Esc, drag-dismiss).
6. **`02-ARCHITECTURE-AND-STATE.md`** + **`05-FLOWS-AND-SCREENS.md`** — `app/page.tsx`: messages state, history ref, inline header app-bar (`goHome()` full reset), scroll area, streaming + verification orchestration, `aria-live` region; every screen/flow as explicit state transitions.
7. **`06-COPY-KO.md`** — all Korean UI strings verbatim (onboarding presets, verdict labels, placeholders, status pill). Wire these in as you build steps 5–6.

> The **dependency order** (tokens → types → api → components → page → copy) is what matters; the doc numbers above already follow the actual sibling filenames in `web/docs/` (see `README.md` for the authoritative number→topic index: **00**=Overview · **01**=Design System · **02**=Architecture & State · **03**=API Contract · **04**=Components · **05**=Flows & Screens · **06**=Copy (KO) · **07**=Types). Note this is read-order numbering, not build-order — the build sequence here intentionally jumps (01 → 07 → 03 → 04 → 02/05 → 06).
