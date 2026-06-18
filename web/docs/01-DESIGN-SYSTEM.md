# 01 — Toss Design System (tokens, type, motion)

> The single, self-contained design-system contract for the **SpendSentry** web frontend.
> Every color, radius, shadow, font, type-size, and spring value below is the **exact** value
> shipped in `tailwind.config.ts` and `globals.css`. Rebuild the visual language from this file
> alone: an AI reading only this doc must produce a pixel-faithful Toss-style UI.

**Source files specified (rebuild these):**

- `web/tailwind.config.ts` — **full file** (the `content` glob + the typed `config` wrapper, see §1.0) plus color tokens, custom radius, shadows, font family.
- `web/app/globals.css` — Pretendard CDN import, body base, `.skeleton` shimmer, `.no-scrollbar`, `.pb-safe`.
- `web/DESIGN.md` — prior design notes; **this doc supersedes and expands it** (treat 01-DESIGN-SYSTEM.md as canonical).

**Sibling docs (do not duplicate their scope):**

- `02-ARCHITECTURE-AND-STATE.md` — RootLayout, in-page header app-bar, single-column layout, scroll/composer placement.
- `04-COMPONENTS.md` — ChatBubble, Composer, Markdown, ReceiptSheet, TypingDots, Onboarding implementation.
- `02-ARCHITECTURE-AND-STATE.md` — TypeScript types, `SEVERITY_META`, message discriminated union.
- `03-API-CONTRACT.md` — `/api/verify-receipt`, `/api/chat` text/plain streaming, `next.config.js` rewrites.
- `06-COPY-KO.md` — verbatim Korean UI strings.

This doc owns **tokens, typography, and motion**. Where a Korean string appears here it is reproduced
**verbatim** (exact characters/punctuation/emoji); the authoritative copy list is `06-COPY-KO.md`.

---

## 0. Design philosophy (the 6 rules that produce "Toss feel")

1. **Single accent color.** Toss blue `#3182f6` is the *only* action color — buttons, links, PASS, emphasis text, focus rings. Nothing else is ever blue.
2. **Red & yellow are state-only.** `#f04452` (danger/FAIL/심각) and `#ff9500` (caution/REVIEW/주의) never act as buttons or links — only as status surfaces/text.
3. **Green is status-only.** The online dot `#16c47f` signals liveness; never an action color.
4. **Springs, never linear.** Every entrance/transition uses a framer-motion spring (natural bounce). No `ease`, `linear`, or instant snaps for mount/dismiss.
5. **Numbers and verdicts are big and bold.** Amounts and PASS/FAIL land first; `font-extrabold`, large px sizes. Supporting text small and gray.
6. **Surfaces + whitespace, not borders.** Group info in rounded cards on muted/white surfaces separated by soft shadow + generous gaps. Avoid hairline borders; never pure black.

---

## 1. Color tokens (exact)

### 1.0 `tailwind.config.ts` — full file scaffolding (load-bearing)

The token blocks in §1–§4 (`colors`, `borderRadius`, `boxShadow`, `fontFamily`) all live under
`theme.extend` of **one** `tailwind.config.ts`. Reproduce the whole file wrapper — the
`import`, the typed `const config`, the `content` glob, `plugins: []`, and the `export default`.
**Copy verbatim:**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // colors (§1.1) / borderRadius (§3) / boxShadow (§4) / fontFamily (§2.1)
    },
  },
  plugins: [],
};
export default config;
```

> **The `content` glob is load-bearing — do not omit or narrow it.** Tailwind JIT scans only the
> files matched by `content` and emits a class **only if** it appears as a literal in a scanned
> file. The two globs `"./app/**/*.{ts,tsx}"` and `"./components/**/*.{ts,tsx}"` cover every page,
> layout, and component (`app/` + `components/`, `.ts`/`.tsx`). **If `content` is missing, empty, or
> wrong, Tailwind emits zero utility classes and the rebuilt UI renders completely unstyled** — every
> `bg-toss-bg`, `rounded-4xl`, `shadow-toss`, `text-[17px]`, etc. silently produces no CSS. This is
> the single most common reason a faithfully-rebuilt UI looks broken; verify it first.

Notes on the wrapper:

- `import type { Config } from "tailwindcss"` + `const config: Config = { … }` gives type-checked
  tokens (TS config, not `.js`). End with `export default config;`.
- `plugins: []` — **no** Tailwind plugins (no `@tailwindcss/typography`, `forms`, etc.). Markdown
  prose styling is hand-rolled in the `Markdown` component, not via the typography plugin (see
  `04-COMPONENTS.md`). Keep this empty.
- Everything custom goes under `theme.extend` (additive) — never replace `theme` wholesale, or you
  lose Tailwind's default palette that §1.4 state surfaces (`blue-50`/`red-50`/`orange-50`) depend on.

### 1.1 Color palette (`theme.extend.colors`)

Tailwind palette key is `toss.*` → utilities `text-toss-blue`, `bg-toss-bg`, `border-toss-line`, etc.
Copy this block **verbatim** into `tailwind.config.ts` under `theme.extend.colors`:

```ts
colors: {
  toss: {
    blue:     "#3182f6",
    blueDark: "#1b64da",
    bg:       "#f2f4f6",
    card:     "#ffffff",
    gray:     "#6b7684",
    ink:      "#191f28",
    line:     "#e5e8eb",
    red:      "#f04452",
    yellow:   "#ff9500",
  },
},
```

### 1.2 Core tokens & roles

| Token | Utility | Hex | Role |
|---|---|---|---|
| `toss-blue` | `bg/text/ring/border-toss-blue` | `#3182f6` | **Primary** — action buttons, links, PASS, emphasis text, focus ring (`ring-toss-blue`) |
| `toss-blueDark` | `bg-toss-blueDark` | `#1b64da` | Blue hover / pressed state |
| `toss-ink` | `text-toss-ink` | `#191f28` | **Body text** — near-black; **never** pure `#000`. Also the stop-button fill (`bg-toss-ink`) |
| `toss-gray` | `text-toss-gray` | `#6b7684` | **Secondary text**, placeholder, caption, meta (passes AA on white) |
| `toss-line` | `bg/border-toss-line` | `#e5e8eb` | Dividers, borders, disabled surfaces, sheet drag handle |
| `toss-bg` | `bg-toss-bg` | `#f2f4f6` | App + header background; muted inner surfaces (metric cards, attach button) |
| `toss-card` | `bg-toss-card` | `#ffffff` | Cards, bubbles, bottom-sheet surface |
| `toss-red` | `bg/text-toss-red` | `#f04452` | **Danger / FAIL / 심각 (critical)** |
| `toss-yellow` | `bg/text-toss-yellow` | `#ff9500` | **Caution / REVIEW (검증 불가) / 주의** |

### 1.3 Soft accent tints (arbitrary hex, used as icon tiles / category cards)

These are *not* Tailwind tokens — they appear inline as `bg-[#...]`. Use exactly:

| Hex | Used for |
|---|---|
| `#e8f3ff` | Header brand icon tile (🧾); 교통 category tile. The official Toss `blue50`. |
| `#fff4e6` | 식대 category tile (warm) |
| `#fdeef0` | 접대 category tile (pink) |
| `#eafaf1` | 출장 category tile (mint) |
| `#16c47f` | Header "온라인" status dot (green; status-only) |

### 1.4 State surfaces (verdict banners & violation/badge backgrounds)

Built from Tailwind's **default** palette (`blue-50`, `red-50`, `orange-50`) paired with `toss-*` text:

| State | Surface | Text/icon |
|---|---|---|
| PASS / 누락 (info) | `bg-blue-50` | `text-toss-blue` |
| FAIL / 심각 (critical) | `bg-red-50` | `text-toss-red` |
| REVIEW / 주의 (caution) | `bg-orange-50` | `text-toss-yellow` |

> Severity → color mapping lives in `SEVERITY_META` (`lib/types.ts`) as the single source of truth and is reused by both `page.tsx` (FAIL chip counts) and `ReceiptSheet`. See `02-ARCHITECTURE-AND-STATE.md`.

### 1.5 Overlay / dim

- Sheet backdrop: `bg-black/40` (40% black). The only place black is used, and only as a scrim.

### 1.6 Color do/don't

- ✅ Blue is the lone accent. Red/yellow strictly state. Green strictly status.
- ✅ Body text never grayer than `toss-gray` (`#6b7684`) — anything lighter fails contrast.
- ❌ Pure black `#000` for text/borders. Use `toss-ink` for text, `toss-line` for separators.
- ❌ Purple/teal gradients, multi-color accents, heavy hairline borders (generic-AI look).

---

## 2. Typography

### 2.1 Font family

**Pretendard**, loaded via CDN `@import` at the top of `globals.css` (after the `@tailwind` directives) — **verbatim**:

```css
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard-dynamic-subset.css");
```

> **Ordering caveat (`@import` placement).** The source deliberately places this `@import` **after**
> the three `@tailwind` directives (`base`/`components`/`utilities`). Per the CSS spec a real `@import`
> must precede all other rules/at-rules in a stylesheet, so a strict CSS parser would reject an
> `@import` that sits after `@tailwind base;`. **It works here because Next.js's PostCSS pipeline
> processes the file before the browser sees it:** `tailwindcss` expands the `@tailwind` directives and
> the bundler hoists/inlines the `@import`, so the emitted CSS is spec-valid and the order in the
> source file is irrelevant to the browser. **Not a blocker** — reproduce the source order verbatim.
> Caveat only: if you ever serve `globals.css` raw (no PostCSS/Tailwind build), move the `@import`
> above the `@tailwind` lines so the font still loads.

Fallback stack in `tailwind.config.ts` (`fontFamily.sans`), **verbatim**:

```ts
fontFamily: {
  sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
},
```

The `<body>` uses `font-sans` (set in `RootLayout`, see `02-ARCHITECTURE-AND-STATE.md`), so Pretendard is the default everywhere.

### 2.2 Type scale (fixed px via `text-[..]`)

Sizes are **arbitrary px** (`text-[17px]`), not Tailwind's named scale — match these exactly.

| Use | Size | Weight class | Notes |
|---|---|---|---|
| App-bar title (`SpendSentry`) | 17px | `font-extrabold` | brand title in header button |
| Onboarding title (`무엇을 검증할까요?`) | 21px | `font-extrabold` | empty-state heading |
| Verdict title (in ReceiptSheet) | 24px | `font-extrabold` | the big PASS/FAIL/REVIEW |
| Markdown `h1` | 20px | `font-extrabold` | assistant answer headings |
| Markdown `h2` / verdict chip label | 18px | `font-extrabold` | sub-headings; chip verdict text |
| Onboarding CTA title | 15.5px | `font-extrabold` | `영수증 바로 검증하기` |
| Onboarding category label | 15px | `font-bold` | 식대/교통/접대/출장 |
| Body / bubble text | 16px | regular | `leading-relaxed` |
| Secondary / description | 14px | regular (`font-bold` for emphasis) | chip subtext, descriptions |
| Caption / label / meta | 13px | `font-semibold` / regular | header subtitle, sub-labels |
| Status pill / header subtitle | 12px | `font-bold` / regular | `온라인`, `Sentri AI 컴플라이언스` |
| Onboarding CTA sub | 12.5px | regular | `text-white/80` |

### 2.3 Weight & rhythm rules

- **Conclusions** (titles, amounts, PASS/FAIL/REVIEW) → `font-extrabold`.
- **Emphasized words** inside body → `font-bold`.
- **Body** → regular weight.
- **Line height**: body `leading-relaxed`; list items `leading-snug` (tight). In Markdown, kill paragraph margins inside list items with `[&_li>p]:my-0`.
- **Numbers/currency**: format with `toLocaleString()` and a `₩` prefix; amounts are large and bold.

### 2.4 Font rendering (from `globals.css`, verbatim)

```css
html, body {
  padding: 0;
  margin: 0;
  background: #f2f4f6;
  color: #191f28;
  -webkit-font-smoothing: antialiased;
}
```

`-webkit-font-smoothing: antialiased` is required for the crisp Toss look. Body background is the raw hex `#f2f4f6` (= `toss-bg`) and default text color `#191f28` (= `toss-ink`).

---

## 3. Radius scale

Only **one** custom radius is added; the rest are Tailwind defaults. Custom token in `tailwind.config.ts`:

```ts
borderRadius: {
  "4xl": "28px",
},
```

| Class | px | Used for |
|---|---|---|
| `rounded-4xl` | **28** (custom) | Bubbles, cards, composer pill, bottom-sheet top (`rounded-t-4xl`) |
| `rounded-3xl` | 24 (default) | Inner cards (metric cards), onboarding cards, primary buttons |
| `rounded-2xl` | 16 (default) | Small chips |
| `rounded-xl` | 12 (default) | Icon tiles (header 🧾 tile, category icon tiles) |
| `rounded-lg` | 8 (default) | **Bubble tail** — the single squared corner (`rounded-tr-lg` user / `rounded-tl-lg` assistant) |
| `rounded-full` | 9999 | Icon buttons, status pill, sheet drag handle |

> The "tail" trick: a bubble is `rounded-4xl` on three corners and `rounded-lg` on one top corner, giving a speech-bubble notch without an actual tail.

---

## 4. Elevation (shadows & dim)

Surfaces are nearly flat — shadows are **very soft**, just a hint of float. Custom shadows in `tailwind.config.ts`:

```ts
boxShadow: {
  toss:  "0 2px 16px rgba(0,0,0,0.06)",
  sheet: "0 -8px 40px rgba(0,0,0,0.12)",
},
```

| Token | Value | Use |
|---|---|---|
| `shadow-toss` | `0 2px 16px rgba(0,0,0,0.06)` | Cards, bubbles, composer pill — everyday float |
| `shadow-sheet` | `0 -8px 40px rgba(0,0,0,0.12)` | Bottom sheet (shadow points **upward**) |
| dim overlay | `bg-black/40` | Scrim behind the sheet |

**Inline soft-blue lift** on the onboarding primary CTA (not a token — use verbatim):

```
shadow-[0_8px_22px_rgba(49,130,246,0.26)]
```

This is the only colored shadow; it tints the CTA's drop shadow with the blue accent.

---

## 5. Motion (framer-motion springs)

All entrances/dismissals are **springs**. Use these exact params (`transition={{ type: "spring", ... }}`).
Never substitute `ease`/`linear`/`tween` for mount/dismiss. Tap feedback uses `whileTap` scale, not springs.

### 5.1 Spring parameter table

| Element | Spring params | from → to |
|---|---|---|
| **ChatBubble** mount | `{ type:"spring", stiffness:500, damping:30, mass:0.8 }` | `{ opacity:0, y:14, scale:0.96 }` → `{ opacity:1, y:0, scale:1 }` |
| **ReceiptSheet** enter/exit | `{ type:"spring", stiffness:380, damping:36 }` | `y:"100%"` → `y:0` (exit back to `"100%"`) |
| **Onboarding** mount | `{ type:"spring", stiffness:400, damping:32 }` | `{ opacity:0, y:10 }` → `{ opacity:1, y:0 }` |
| **Violation card** stagger | `{ type:"spring", ...; delay: 0.1 + i*0.06 }` | `{ opacity:0, y:10 }` → `{ opacity:1, y:0 }` (index `i` per card) |

> Violation cards: base delay `0.1s`, then `+0.06s` per card index `i` (card 0 = 0.10s, card 1 = 0.16s, card 2 = 0.22s, …) for a cascading reveal. Pair the spring with the per-card `delay`.

### 5.2 Tap / press feedback (not springs)

| Element | Feedback |
|---|---|
| Primary buttons (CTA, `확인`, send) | `active:scale-[0.98] transition-transform` |
| Brand home button (header) | `active:scale-[0.98] transition-transform` |
| Icon buttons (attach `＋`, send `↑`/stop `■`) | framer-motion `whileTap={{ scale: 0.88 }}` |
| Verdict chip | `cursor-pointer hover:opacity-80` |

### 5.3 Drag-to-dismiss (ReceiptSheet)

- Sheet is draggable on the Y axis; dragging **down > 120px** dismisses (close). Re-snaps with the enter spring otherwise. See `04-COMPONENTS.md`.

### 5.4 Motion do/don't

- ✅ Spring on every mount/dismiss; natural bounce.
- ❌ Linear/instant transitions; over-bouncy springs (low damping). Keep damping high enough that bounces settle quickly (values above).

---

## 6. Reusable utility classes (in `globals.css`)

Copy these **verbatim** into `globals.css` (after the `@tailwind` directives and the Pretendard import).

### 6.1 Skeleton shimmer (receipt-parse wait state)

```css
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, #eef1f4 25%, #e2e6ea 37%, #eef1f4 63%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease infinite;
}
```

Apply `.skeleton` to a sized block to show a left-to-right shimmer while the OCR/rule result is pending.

### 6.2 Hidden scrollbar (mobile feel)

```css
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

Apply to the scrollable conversation area so the column scrolls without a visible bar.

### 6.3 iOS safe-area bottom padding

```css
.pb-safe { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
```

Wrap the composer in `.pb-safe` so the input bar clears the iOS home-bar / gesture area. Pairs with `viewportFit:"cover"` on the viewport (see `02-ARCHITECTURE-AND-STATE.md`).

### 6.4 Global box-sizing

```css
* { box-sizing: border-box; }
```

---

## 7. Spacing & sizing conventions

(Layout details live in `02-ARCHITECTURE-AND-STATE.md`; these are the design-system constants used across components.)

| Region | Padding / gap |
|---|---|
| Outer container | `px-4` |
| Header | `px-5 pt-3 pb-3.5` |
| Bubbles | `px-5 py-3.5`, `max-w-[78%]` |
| Message list | `flex flex-col gap-3` |
| Metric grid (sheet) | `gap-2.5` |
| Onboarding category grid | `grid grid-cols-2 gap-2.5` → `md:grid-cols-4` on desktop |

- **Centered column**: each region centers content at `max-w-3xl` (768px) via `mx-auto`; edge-to-edge on phones, roomy column on desktop.
- **Viewport height**: root uses `h-[100dvh]` (dynamic viewport). **Never** `100vh` (mobile clipping).
- **Touch targets**: minimum 44×44 (`w-11 h-11`) for all icon buttons.
- **Icon tiles**: header brand 🧾 tile ≈ 38px `rounded-xl bg-[#e8f3ff]`; category tiles 40px `rounded-xl` with their tint.

---

## 8. Accessibility tokens (cross-cutting)

These are part of the design system because they affect visual focus state and zoom:

- **Focus ring (universal)**: every interactive element gets
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue`.
  The ring color is always the blue accent.
- **Zoom allowed**: viewport must **not** set `maximum-scale=1` (WCAG 1.4.4 — pinch-zoom must work). Viewport allows pinch-zoom with `viewportFit:"cover"`.
- **Status/live**: TypingDots carries `role="status"`; the assistant aria-live region is `polite` and updated only on turn completion.
- **Contrast floor**: secondary text never lighter than `toss-gray` `#6b7684`.

---

## 9. Quick palette card (for prompt pasting)

> primary `#3182f6` · blueDark `#1b64da` · ink `#191f28` · sub-text `#6b7684` · surface `#ffffff` · muted `#f2f4f6` · line `#e5e8eb` · danger `#f04452` · warn `#ff9500` · online `#16c47f`.
> Tints: blue50 `#e8f3ff` · 식대 `#fff4e6` · 접대 `#fdeef0` · 출장 `#eafaf1`.
> Font **Pretendard** (CDN @import) → `-apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
> Radius 28 (`4xl`) / 24 / 16 / 12 / 8(tail) / full. Shadow `0 2px 16px rgba(0,0,0,.06)` (toss), `0 -8px 40px rgba(0,0,0,.12)` (sheet).
> Motion = framer-motion **spring** (bubble 500/30/0.8 · sheet 380/36 · onboarding 400/32 · violation stagger `0.1+i*0.06`).
> One accent (blue). Red/yellow = state only. Green = status only.

---

## 10. Do's & Don'ts (consolidated)

**Do**

- ✅ One accent color (Toss blue). Red/yellow for states only; green for status only.
- ✅ Entrances/transitions are springs (framer-motion) with the exact params in §5.
- ✅ Conclusions (amount, verdict) big and bold; supporting info small in `toss-gray`.
- ✅ Group info into rounded cards (`rounded-3xl`/`rounded-4xl`) with generous whitespace + `shadow-toss`.
- ✅ Touch targets ≥ 44px; always a `ring-toss-blue` focus ring.
- ✅ Korean honorific copy, concise; emoji as state signals only (✅ ❌ 🔎 🧾 🚕). See `06-COPY-KO.md`.

**Don't**

- ❌ Pure black `#000` or border overuse — separate with surface + soft shadow.
- ❌ Body text grayer than `toss-gray` (fails contrast).
- ❌ Linear/instant transitions or over-bouncy (under-damped) springs.
- ❌ `whitespace-pre-wrap` on assistant markdown (double-spacing bug); allow it only on plain-text user bubbles.
- ❌ `100vh` (use `100dvh`); `maximum-scale=1` (blocks zoom — forbidden).
- ❌ Generic-AI aesthetics: purple gradients, heavy borders, tiny gray body text, multi-accent palettes.
