# 04 — Component Specs

Build spec for every React component (and the inline header) of the SpendSentry web frontend. Each section below is a contract: props/handle, behavior, exact Tailwind class strings, motion params, and a11y. An AI reading only this doc must be able to rebuild each part 1:1. All Korean UI strings are verbatim — copy them exactly.

**Source files specified**
- `web/components/ChatBubble.tsx`
- `web/components/Composer.tsx`
- `web/components/Markdown.tsx`
- `web/components/ReceiptSheet.tsx`
- `web/components/TypingDots.tsx`
- `web/components/Onboarding.tsx`
- `web/app/page.tsx` (header app-bar is inline here; also the message-list renderer + verdict chip + skeleton)
- `web/lib/types.ts` (types + `SEVERITY_META`)
- `web/DESIGN.md` (design-token rationale)

**Sibling docs (do not duplicate their scope):** design tokens/Tailwind config → see `01-DESIGN-SYSTEM.md`; page orchestration/state/data-flow → see `02-ARCHITECTURE-AND-STATE.md`; `lib/api.ts` (streamChat / verifyReceipt / endpoints) → see `03-API-CONTRACT.md`; the full type model (`Message`, `VerifyResult`, `SEVERITY_META`, …) → see `07-TYPES.md`; all Korean copy → see `06-COPY-KO.md`; the two screens + every flow as state transitions → see `05-FLOWS-AND-SCREENS.md`.

**Cross-cutting conventions used by every component**
- Every file that uses hooks, motion, or browser APIs starts with `"use client";`.
- Motion is **framer-motion springs**, never linear/instant. Import `motion` (and `AnimatePresence` where exit animations are needed) from `framer-motion`.
- Focus ring (reused literal, present on every interactive element): `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue`. Some files hoist this into a `const focusRing = "..."`.
- Color/radius/shadow tokens (`toss-blue`, `toss-ink`, `toss-gray`, `toss-bg`, `toss-card`, `toss-line`, `toss-red`, `toss-yellow`, `rounded-4xl`=28px, `rounded-3xl`=24px, `rounded-2xl`=16px, `shadow-toss`, `shadow-sheet`) come from `tailwind.config.ts` — see `01-DESIGN-SYSTEM.md`.
- Type imports come from `@/lib/types`; the `@/` alias maps to `web/`.

---

## Types reference (from `lib/types.ts`) — needed by several components

```ts
export type Severity = "심각" | "주의" | "누락";

// Single source of truth for severity icon/label/colors (page.tsx + ReceiptSheet both consume it).
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red",    bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue",   bg: "bg-blue-50" },
};

export interface Violation   { severity: Severity; rule: string; rule_tag: string; item: string; detail: string; }
export interface ReceiptData {
  amount: number | null; date: string | null; vendor: string; category: string;
  payment_method: string; evidence_type: string; ride_datetime: string; origin: string; destination: string;
}
export interface VerifyResult { verdict: "PASS" | "FAIL" | "REVIEW"; receipt: ReceiptData; violations: Violation[]; counts: Record<Severity, number>; }
export interface ChatTurn     { role: "user" | "assistant"; content: string; }

export type Message =
  | { id: string; kind: "text";    role: "user" | "assistant"; content: string }
  | { id: string; kind: "receipt"; role: "assistant";          result: VerifyResult }
  | { id: string; kind: "image";   role: "user";               url: string; name: string }
  | { id: string; kind: "error";   role: "assistant";          content: string; retry: { text: string; file: File | null } };
```

`SEVERITY_META` order is `심각 → 주의 → 누락` and `Object.keys(SEVERITY_META)` is relied on for that order in `failLabel` (see Verdict chip). Full type detail lives in `07-TYPES.md`; endpoint/wire shapes in `03-API-CONTRACT.md`.

---

## 1. Header app-bar — inline in `app/page.tsx` (NO `Header.tsx` file)

The app bar is rendered directly inside `Home`'s JSX, not a separate component. There is intentionally no `Header.tsx`.

**Structure**
- `<header className="bg-toss-bg">` wrapping a centered inner row: `<div className="mx-auto w-full max-w-3xl flex items-center gap-2.5 px-5 pt-3 pb-3.5">`.
- Two children: (a) the **brand go-home button** (flex-1), (b) the **online pill** (right, shrink-0).

**Brand go-home button** — `type="button"`, `aria-label="SpendSentry · 처음 화면으로"`, `onClick={goHome}`.
- Class: `flex items-center gap-2.5 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue rounded-xl`.
- Icon tile: `<div className="flex shrink-0 items-center justify-center w-[38px] h-[38px] rounded-xl bg-[#e8f3ff] text-[20px]">🧾</div>`.
- Title block (`min-w-0`):
  - `<span className="block text-[17px] font-extrabold tracking-tight leading-tight">SpendSentry</span>`
  - `<div className="text-[12px] text-toss-gray mt-px">Sentri AI 컴플라이언스</div>`

**Online pill** (non-interactive, right side)
- `<div className="flex shrink-0 items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[12px] font-bold text-toss-gray">`
- Dot: `<span className="w-1.5 h-1.5 rounded-full bg-[#16c47f]" />` (6px green; **status color only**, never an action color).
- Text node: `온라인`.

**`goHome()` behavior** (defined in `page.tsx`) — full reset so the onboarding empty state re-renders:
1. `abortRef.current?.abort()` — cancel any in-flight chat stream.
2. `setBusy(false)`, `setVerifying(false)`.
3. `setMessages([])`.
4. `historyRef.current = []` (clears `/api/chat` context).
5. `setSheet(null)` (closes ReceiptSheet).
6. `setLive("")` (clears the aria-live region).

**a11y:** the whole brand area is one button (large 38px+ target), labelled `SpendSentry · 처음 화면으로`; focus ring present. The pill is a plain div (no role/tabindex).

---

## 2. Onboarding — `components/Onboarding.tsx`

Empty-state screen shown when `messages.length === 0 && !busy`. Category grid + a receipt CTA; routes everything to real backend calls (no hardcoded answers).

**Props**
```ts
{ onAsk: (q: string) => void; onAttach: () => void; }
```
- `onAsk(q)` — page passes `(q) => handleSubmit(q, null)`; sends the category's preset question to `/api/chat`.
- `onAttach()` — page passes `() => composerRef.current?.openFilePicker()`; opens the Composer file picker.

**Category data** — a `const CATEGORIES` array (`as const`), 4 items, rendered in order:

| key | icon | tile (tint) | label | sub | q (sent via `onAsk`) |
|---|---|---|---|---|---|
| `meal` | 🍚 | `bg-[#fff4e6]` | `식대` | `점심·저녁·야근` | `점심 식대 한도가 궁금해요` |
| `transit` | 🚕 | `bg-[#e8f3ff]` | `교통` | `택시·야근 이동` | `야근 택시비 규정 알려주세요` |
| `entertain` | 🤝 | `bg-[#fdeef0]` | `접대` | `청탁금지법 한도` | `접대비 한도가 궁금해요` |
| `trip` | ✈️ | `bg-[#eafaf1]` | `출장` | `정산·승인 절차` | `출장비 정산 절차가 궁금해요` |

**Root** (motion.div)
- Mount: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 400, damping: 32 }}`.
- Class: `flex-1 flex flex-col justify-center px-1 pb-5` (vertically centered in the scroll area).

**Heading**
- `<h2 className="text-[21px] font-extrabold tracking-tight">무엇을 검증할까요?</h2>`
- `<p className="text-[13px] text-toss-gray mt-1 mb-[18px]">카테고리를 고르면 규정을 안내해 드려요.</p>`

**Grid** — `<div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">` (2 cols mobile → 4 cols / one row on `md`).
Each card is a `<button onClick={() => onAsk(c.q)}>`:
- Class: `flex flex-col gap-2.5 rounded-3xl bg-white p-4 text-left shadow-toss active:scale-[0.97] transition-transform ${focusRing}`.
- Icon tile: `<span className="flex items-center justify-center w-10 h-10 rounded-xl text-[20px] ${c.tile}">{c.icon}</span>` (40px rounded-xl tinted).
- Label/sub block:
  - `<span className="block text-[15px] font-bold text-toss-ink">{c.label}</span>`
  - `<span className="block text-[12px] text-toss-gray mt-0.5">{c.sub}</span>`

**Primary CTA** — `<button onClick={onAttach}>`:
- Class: `mt-[11px] flex items-center gap-3 w-full rounded-3xl bg-toss-blue px-4 py-[17px] text-left shadow-[0_8px_22px_rgba(49,130,246,0.26)] active:scale-[0.98] transition-transform ${focusRing}`.
- White icon tile: `<span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 text-[20px]">🧾</span>`.
- Text block (`flex-1`):
  - `<span className="block text-[15.5px] font-extrabold text-white">영수증 바로 검증하기</span>`
  - `<span className="block text-[12.5px] text-white/80 mt-0.5">이미지를 첨부하면 즉시 판정</span>`
- Trailing chevron: `<span className="text-[20px] text-white/85">›</span>`.

**`focusRing` const** in this file: `"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue"`.

---

## 3. Composer — `components/Composer.tsx`

Bottom input bar. A `forwardRef` component exposing an imperative handle so the parent (Onboarding CTA) can open the file picker.

**Handle (exported)**
```ts
export interface ComposerHandle { openFilePicker: () => void; }
```

**Props**
```ts
{ disabled?: boolean; onSend: (text: string, file: File | null) => void; onStop?: () => void; }
```
- `disabled` — true while busy/streaming; toggles send→stop and blocks send.
- `onSend(text, file)` — called with trimmed text + selected file (or `null`).
- `onStop()` — called by the stop button.

**Local state / refs**
- `text: string`, `file: File | null`, `preview: string | null` (objectURL).
- `fileRef` → the hidden `<input type="file">`; `taRef` → the textarea.
- `useImperativeHandle(ref, () => ({ openFilePicker: () => fileRef.current?.click() }), [])`.

**`pick(f: File | null)` — set/clear attachment with leak-safe preview**
- Revokes the previous objectURL before replacing: `setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; })`.
- `setFile(f)`.
- (Note: the Composer preview uses **objectURL** and revokes it; the persisted message image in `page.tsx` uses a **data URL** instead — no revoke needed. Don't conflate them.)

**`send()`**
- Guard: `if (disabled || (!text.trim() && !file)) return;`
- `onSend(text.trim(), file)` → clear: `setText("")`, `pick(null)`.
- Reset textarea height: `if (taRef.current) taRef.current.style.height = "auto";`

**Layout**
- Outer: `<div className="px-4 pb-safe pt-2 bg-toss-bg">` → inner centerer `<div className="mx-auto w-full max-w-3xl">`. `pb-safe` = iOS safe-area bottom padding (defined in globals.css).

**Attach preview chip** (wrapped in `<AnimatePresence>`, rendered only when `preview` truthy)
- motion.div: `initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}`.
- Class: `mb-2 ml-2 inline-flex items-center gap-2 bg-white rounded-2xl shadow-toss p-1.5 pr-3 w-fit`.
- Thumb: `<img src={preview} alt="첨부한 영수증 미리보기" className="w-10 h-10 rounded-xl object-cover" />` (use plain `<img>`, not next/image).
- Label: `<span className="text-[13px] text-toss-gray">영수증 첨부됨</span>`.
- Remove button: `onClick={() => pick(null)}` `aria-label="첨부 제거"`, class `ml-1 w-5 h-5 rounded-full bg-toss-bg text-toss-gray text-[13px] leading-none ${focusRing}`, glyph `✕`.

**Pill bar** — `<div className="flex items-end gap-2 bg-white rounded-4xl shadow-toss px-3 py-2">` containing:

1. **Attach button** (`＋`)
   - `onClick={() => fileRef.current?.click()}`, `aria-label="첨부"`.
   - Class: `shrink-0 w-11 h-11 rounded-full bg-toss-bg text-[22px] text-toss-gray active:scale-90 transition-transform ${focusRing}` (44px touch target).
   - Glyph is the fullwidth plus `＋`.

2. **Hidden file input — CRITICAL implementation detail**
   - `<input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} onChange={...} />`
   - It MUST use `className="sr-only"` (visually hidden but kept in layout/DOM) and `tabIndex={-1}`. Do **NOT** use `hidden` / `display:none` / `className="hidden"`: Safari/iOS refuses a programmatic `.click()` on a `display:none` input, so the picker would never open from the `＋` button or the Onboarding CTA.
   - `accept` is `image/png,image/jpeg` only.
   - onChange: take `const f = e.target.files?.[0]; if (f) pick(f); e.target.value = "";` — resetting `value` after every pick so re-selecting the same file fires `onChange` again.

3. **Textarea** (`taRef`, auto-grow)
   - `value={text}`, `onChange={e => setText(e.target.value)}`.
   - `onInput`: auto-grow up to 128px — `const ta = e.currentTarget; ta.style.height = "auto"; ta.style.height = \`${Math.min(ta.scrollHeight, 128)}px\`;`.
   - `onKeyDown`: Enter (without Shift) sends — `if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }`. Shift+Enter inserts a newline (default behavior).
   - `rows={1}`, `aria-label="메시지 입력"`, `title="Enter 전송 · Shift+Enter 줄바꿈"`.
   - Placeholder is conditional on `file`:
     - with file: `영수증에 대해 물어보세요 (예: 확인해줘)`
     - without file: `메시지 입력 또는 영수증 첨부`
   - Class: `flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-toss-gray max-h-32`.

4. **Send / Stop toggle** (right) — exactly one renders based on `disabled`.
   - **Stop** (when `disabled` true): `motion.button whileTap={{ scale: 0.88 }}`, `onClick={onStop}`, `aria-label="생성 중지"`, class `shrink-0 w-11 h-11 rounded-full bg-toss-ink text-white flex items-center justify-center ${focusRing}`. Inner square icon: `<span className="block w-3 h-3 rounded-[3px] bg-white" />`.
   - **Send** (when `disabled` false): `motion.button whileTap={{ scale: 0.88 }}`, `onClick={send}`, `disabled={!text.trim() && !file}`, `aria-label="전송"`, class `shrink-0 w-11 h-11 rounded-full bg-toss-blue text-white text-[20px] disabled:opacity-30 transition-opacity ${focusRing}`. Glyph: `↑`.

**`focusRing` const** in this file: `"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue"`.

**Export note:** the file both wraps the function in `forwardRef(...)` and ends with `export default Composer;`. Parent imports default + the `ComposerHandle` type: `import Composer, { type ComposerHandle } from "@/components/Composer";`.

---

## 4. ChatBubble — `components/ChatBubble.tsx`

Spring-animated message bubble. User bubbles are right-aligned blue; assistant bubbles are left-aligned white. The parent decides what goes inside (plain string for user, `<Markdown>` for assistant).

**Props**
```ts
{ role: "user" | "assistant"; children: React.ReactNode; }
```
`const isUser = role === "user";`

**Wrapper** (motion.div)
- Mount: `initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.8 }}`.
- Class: `flex ${isUser ? "justify-end" : "justify-start"}`.

**Bubble** (inner div) — classes joined from two parts:
- Base: `max-w-[78%] px-5 py-3.5 text-[16px] leading-relaxed shadow-toss ${isUser ? "whitespace-pre-wrap" : ""}`.
- Role-specific:
  - user: `bg-toss-blue text-white rounded-4xl rounded-tr-lg`
  - assistant: `bg-toss-card text-toss-ink rounded-4xl rounded-tl-lg`
- The "tail" is one squared corner: user → top-right `rounded-tr-lg` (8px); assistant → top-left `rounded-tl-lg`.

**Critical:** `whitespace-pre-wrap` is applied to **user bubbles only**. Never add it to assistant bubbles — markdown blank lines between blocks would render as double spacing. Assistant content is rendered through `<Markdown>` which manages its own spacing.

This same wrapper is also reused (without the component) by the page for: error bubbles (assistant role, with a retry button child) and verdict-chip bubbles (assistant role, with a tappable button child). See the Verdict chip and Page renderer sections.

---

## 5. Markdown — `components/Markdown.tsx`

`memo`'d react-markdown + remark-gfm renderer for assistant answers (tables, bold, lists, headings). Memoized so unchanged bubbles don't re-parse while another bubble streams.

**Props:** `{ children: string }` (the raw markdown string). Export is `export default memo(Markdown)`.

**Setup**
- `import ReactMarkdown from "react-markdown"; import remarkGfm from "remark-gfm";`
- Wrapped in an outer `<div className="[&_li>p]:my-0">` — forces zero vertical margin on the `<p>` that react-markdown injects inside `<li>` in loose-list mode (prevents double spacing in list items, without depending on react-markdown internals).
- `<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ... }}>{children}</ReactMarkdown>`.

**Component overrides** (exact classes — spacing is intentionally tight):

| el | className |
|---|---|
| `p`  | `my-1 leading-relaxed` |
| `strong` | `font-bold` |
| `h1` | `text-[20px] font-extrabold mt-3 mb-0.5` |
| `h2` | `text-[18px] font-extrabold mt-3 mb-0.5` |
| `h3` | `text-[16px] font-bold mt-2 mb-0.5` |
| `ul` | `list-disc pl-5 my-1 space-y-0` |
| `ol` | `list-decimal pl-5 my-1 space-y-0` |
| `li` | `leading-snug` |
| `a`  | `text-toss-blue underline` |
| `code` | `bg-toss-bg rounded px-1 py-0.5 text-[13px]` |
| `hr` | `my-3 border-toss-line` (rendered as `() => <hr ... />`) |
| `table` | wrapped: `<div className="overflow-x-auto my-2"><table className="w-full text-[14px] border-collapse" /></div>` |
| `thead` | `bg-toss-bg` |
| `th` | `border border-toss-line px-2.5 py-1.5 text-left font-bold` |
| `td` | `border border-toss-line px-2.5 py-1.5 align-top` |

Each override spreads the original props: e.g. `p: (p) => <p className="my-1 leading-relaxed" {...p} />`.

---

## 6. TypingDots — `components/TypingDots.tsx`

Toss-style 3-dot bouncing typing indicator, shown while the assistant streams (rendered by the page inside the busy block when not verifying).

- Container: `<div role="status" aria-label="AI가 답변을 작성 중입니다" className="flex items-center gap-1.5 px-5 py-4 bg-toss-card rounded-4xl rounded-tl-lg shadow-toss w-fit">` — same bubble shape as an assistant bubble (white, left tail).
- Renders `[0, 1, 2].map((i) => <motion.span key={i} ... />)`, each:
  - Class: `w-2.5 h-2.5 rounded-full bg-toss-gray`.
  - Animation: `animate={{ y: [0, -6, 0] }}` with `transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}` (staggered 0.15s so the three dots bounce in a wave).

---

## 7. ReceiptSheet — `components/ReceiptSheet.tsx`

Bottom-sheet modal showing the receipt verdict, extracted metrics, optional taxi route, and animated violation cards. Full modal a11y (dialog role, focus trap, focus restore, Esc, drag-to-dismiss).

**Props**
```ts
{ result: VerifyResult | null; onClose: () => void; }
```
Visibility is driven by `result`: when non-null the sheet is open; `null` keeps it closed. (Page holds this in `sheet` state.)

**Derived values**
- `const verdict = result?.verdict ?? "PASS";`
- `vstyle` — lookup keyed by verdict:
  - `PASS`:   `{ bg: "bg-blue-50",   ink: "text-toss-blue",   icon: "✅", title: "PASS" }`
  - `FAIL`:   `{ bg: "bg-red-50",    ink: "text-toss-red",    icon: "❌", title: "FAIL" }`
  - `REVIEW`: `{ bg: "bg-orange-50", ink: "text-toss-yellow", icon: "🔎", title: "검증 불가" }`
- `subtitle`:
  - PASS → `회사 룰 충족`
  - REVIEW → `영수증을 판독하지 못했어요 · 다시 첨부해 주세요`
  - else (FAIL) → `` `위반 ${result?.violations.length ?? 0}건` `` (e.g. `위반 2건`)
- `const r = result?.receipt;`
- `const isTaxi = !!(r?.ride_datetime || r?.origin);`

**Refs:** `sheetRef` (the dialog div), `prevFocus` (element focused before open).

**Focus management** (`useEffect` on `[result]`)
- On open (`result` truthy): `prevFocus.current = document.activeElement; requestAnimationFrame(() => sheetRef.current?.focus());` (moves focus into the sheet next frame).
- On close (`result` falsy): `prevFocus.current?.focus?.();` (restores focus to the trigger).

**Keyboard handler** `onKeyDown(e)` on the dialog:
- `Escape` → `onClose()`.
- `Tab` → focus trap: query focusables inside the sheet with selector `'button, [href], input, [tabindex]:not([tabindex="-1"])'`; if Shift+Tab on the first element (or on the sheet itself), wrap to last; if Tab on the last element, wrap to first. `e.preventDefault()` on wrap.

**Render** — everything inside `<AnimatePresence>`, gated on `result &&`, as a fragment of two motion elements:

1. **Dim backdrop**
   - `<motion.div className="fixed inset-0 bg-black/40 z-40" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose} />`.

2. **Sheet** (`motion.div`, `ref={sheetRef}`)
   - a11y: `role="dialog" aria-modal="true" aria-label="영수증 검증 결과" tabIndex={-1} onKeyDown={onKeyDown}`.
   - Class: `fixed left-1/2 bottom-0 z-50 w-full max-w-3xl -translate-x-1/2 bg-white rounded-t-4xl shadow-sheet px-6 pt-3 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar focus:outline-none`.
   - Enter/exit: `initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}`.
   - Drag-to-dismiss: `drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.4 }} onDragEnd={(_, info) => info.offset.y > 120 && onClose()}` — drag down > 120px closes.

   **Inner content (top → bottom):**

   a. **Drag handle:** `<div className="mx-auto mb-5 mt-1 h-1.5 w-12 rounded-full bg-toss-line" />`.

   b. **Verdict banner:** `<div className={\`rounded-4xl px-6 py-6 mb-5 text-center ${vstyle.bg}\`}>` containing:
      - icon: `<div className="text-[40px] mb-1">{vstyle.icon}</div>`
      - title: `<div className={\`text-[24px] font-extrabold ${vstyle.ink}\`}>{vstyle.title}</div>`
      - subtitle: `<div className="text-[14px] text-toss-gray mt-1">{subtitle}</div>`

   c. **Metric grid:** `<div className="grid grid-cols-2 gap-2.5 mb-3">` with four `<Metric>` cards (order matters):
      - `금액` → `r?.amount ? \`₩${r.amount.toLocaleString()}\` : "—"`
      - `결제수단` → `r?.payment_method || "—"`
      - `업종` → `r?.category || "—"`
      - `증빙` → `r?.evidence_type || "—"`

      **`Metric` subcomponent** (`{ label, value }: { label: string; value: string }`):
      ```tsx
      <div className="bg-toss-bg rounded-3xl px-4 py-3">
        <div className="text-[13px] text-toss-gray mb-0.5">{label}</div>
        <div className="text-[17px] font-bold text-toss-ink truncate">{value}</div>
      </div>
      ```

   d. **Taxi row** (only when `isTaxi`): `<div className="bg-toss-bg rounded-3xl px-4 py-3 mb-5 text-[15px] text-toss-ink">` rendering:
      `🚕 <b>{r?.origin || "—"}</b> → <b>{r?.destination || "—"}</b><span className="text-toss-gray"> · 🕐 {r?.ride_datetime || "—"}</span>`.

   e. **Violation cards** (only when `result.violations.length > 0`): `<div className="space-y-2.5">` mapping each violation `(v, i)`:
      - `const s = SEVERITY_META[v.severity];` (single source of truth for icon/label/dot/bg).
      - `key={\`${v.rule}-${v.item}-${i}\`}`.
      - Staggered entrance: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 400, damping: 30 }}`.
      - Card class: `rounded-3xl px-5 py-4 ${s.bg}` (severity tint).
      - Header row: `<div className="flex items-center gap-2 mb-1">` → dot `<span className={\`w-2 h-2 rounded-full ${s.dot}\`} />` + meta `<span className="text-[13px] font-semibold text-toss-gray">{s.icon} {s.label} · {v.rule} · {v.rule_tag}</span>`.
      - Item: `<div className="text-[16px] font-bold text-toss-ink">{v.item}</div>`.
      - Detail: `<div className="text-[14px] text-toss-gray mt-0.5 leading-relaxed">{v.detail}</div>`.

   f. **Confirm button** (`확인`): full-width, closes the sheet.
      - `onClick={onClose}`, class `mt-6 w-full rounded-3xl bg-toss-blue py-4 text-[17px] font-bold text-white active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue focus-visible:ring-offset-2`, label `확인`.

**Notes**
- `max-w-3xl` centered (`left-1/2 -translate-x-1/2`) keeps the sheet aligned with the rest of the column. (DESIGN.md's older `max-w-[480px]` is superseded by the source's `max-w-3xl`.)
- `no-scrollbar` hides the scrollbar on the overflow region (utility in globals.css).

---

## 8. Verdict chip + message-list renderer + skeleton — inside `app/page.tsx`

These are not standalone components but are required for faithful reconstruction. The page maps over `messages` and renders one of four `kind`s.

**`failLabel(counts)` helper** — builds the FAIL chip label with severity breakdown:
```ts
function failLabel(counts: Record<Severity, number>): string {
  const parts = (Object.keys(SEVERITY_META) as Severity[])
    .filter((s) => counts?.[s] > 0)
    .map((s) => `${SEVERITY_META[s].label} ${counts[s]}`);
  return parts.length ? `❌ FAIL · ${parts.join(" · ")}` : "❌ FAIL";
}
```
Output examples: `❌ FAIL · 심각 1 · 주의 2` or, with no per-severity counts, `❌ FAIL`. Severity order follows `Object.keys(SEVERITY_META)` = 심각 → 주의 → 누락.

**Message render branches** (`messages.map((m) => ...)`):

- **`kind === "text"`** → `<ChatBubble key={m.id} role={m.role}>{ m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content }</ChatBubble>`. (Assistant → markdown; user → raw string in a `whitespace-pre-wrap` bubble.)

- **`kind === "error"`** → `<ChatBubble role="assistant">` containing `<div className="text-toss-ink">{m.content}</div>` and a retry button:
  - `onClick={() => handleSubmit(m.retry.text, m.retry.file, true)}`, `disabled={busy}`, label `다시 시도`.
  - Class: `mt-2 rounded-2xl bg-toss-bg px-4 py-2 text-[14px] font-bold text-toss-blue active:scale-95 transition-transform disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue`.

- **`kind === "image"`** (user-attached receipt thumbnail, right-aligned) → a motion.div (NOT ChatBubble):
  - `initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}`, class `flex justify-end`.
  - `<img src={m.url} alt="첨부한 영수증 이미지" className="max-w-[60%] rounded-4xl shadow-toss" />` (`m.url` is a data URL — see `02-ARCHITECTURE-AND-STATE.md`).

- **`kind === "receipt"`** → the **verdict chip**, a tappable `<ChatBubble role="assistant">` wrapping a button that opens the sheet (`onClick={() => setSheet(m.result)}`):
  - chip lookup by `m.result.verdict`:
    - `PASS` → `{ ink: "text-toss-blue", label: "✅ PASS" }`
    - `REVIEW` → `{ ink: "text-toss-yellow", label: "🔎 검증 불가" }`
    - `FAIL` → `{ ink: "text-toss-red", label: failLabel(m.result.counts) }`
  - button class: `text-left w-full cursor-pointer rounded-2xl hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue`, `aria-label="영수증 검증 상세 보기"`.
  - line 1: `<div className={\`text-[18px] font-extrabold ${chip.ink}\`}>{chip.label}</div>`.
  - line 2: `<div className="text-[14px] text-toss-gray mt-0.5">₩{(m.result.receipt.amount ?? 0).toLocaleString()} · {m.result.receipt.payment_method || "—"} · 탭하여 상세</div>`.

**Busy indicator block** (after the message list, inside `<AnimatePresence>`, gated on `busy`):
- Wrapper motion.div: `initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}`.
- If `verifying` → **skeleton chip** (receipt OCR wait):
  - `<div role="status" aria-label="영수증을 판독하는 중입니다" className="bg-toss-card rounded-4xl rounded-tl-lg shadow-toss px-5 py-4 w-fit">` containing two shimmer bars:
    - `<div className="skeleton h-5 w-24 rounded-lg mb-2" />`
    - `<div className="skeleton h-3.5 w-40 rounded" />`
  - (`.skeleton` is a shimmer utility defined in globals.css.)
- Else → `<TypingDots />`.

**Scroll sentinel:** `<div ref={bottomRef} />` at the end of the message column; the page calls `bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })` on `[messages, busy]`.

**aria-live region** (between the scroll area and Composer): `<div aria-live="polite" className="sr-only">{live}</div>` — updated only at turn completion (`setLive(acc)` after a stream finishes), not per token, to avoid screen-reader spam.

---

## Verification checklist (build is faithful when all hold)

- [ ] No `Header.tsx` file; app bar is inline in `page.tsx`; brand button `aria-label="SpendSentry · 처음 화면으로"` resets all state via `goHome()`.
- [ ] Online pill dot is `bg-[#16c47f]`, 6px, non-interactive; text `온라인`.
- [ ] Onboarding grid `grid-cols-2 md:grid-cols-4`; 4 category tints `#fff4e6 / #e8f3ff / #fdeef0 / #eafaf1`; CTA shadow `shadow-[0_8px_22px_rgba(49,130,246,0.26)]`.
- [ ] Composer file input uses `className="sr-only"` + `tabIndex={-1}` (NOT `hidden`); `accept="image/png,image/jpeg"`; `value` reset after each pick; objectURL revoked on change.
- [ ] Composer textarea: Enter sends, Shift+Enter newline, auto-grow capped at 128px (`max-h-32`); send `↑` toggles to stop `■` (`bg-toss-ink`) when `disabled`.
- [ ] ChatBubble: `whitespace-pre-wrap` on user only; spring `{500,30,0.8}`; `max-w-[78%]`; tail corner `rounded-tr-lg`/`rounded-tl-lg`.
- [ ] Markdown wrapper has `[&_li>p]:my-0`; remarkGfm enabled; component is `memo`'d.
- [ ] TypingDots `role="status"`, 3 dots, `y:[0,-6,0]`, stagger `i*0.15`.
- [ ] ReceiptSheet: `role="dialog" aria-modal="true"`, focus-in on open + restore on close, Esc closes, Tab trap, drag-down > 120px dismisses, `max-w-3xl` centered, `shadow-sheet`.
- [ ] SEVERITY_META is the single source for severity icon/label/dot/bg in both the FAIL chip (`failLabel`) and ReceiptSheet violation cards.
- [ ] Verdict states: PASS (blue ✅ / `회사 룰 충족`), FAIL (red ❌ + counts breakdown), REVIEW (yellow 🔎 `검증 불가` / re-attach copy).
