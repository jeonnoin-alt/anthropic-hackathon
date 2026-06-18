# 02 — App Architecture & State Model

How the SpendSentry frontend is wired: the Next.js App Router shell, the single-origin `/api` proxy, the responsive container model, and the **complete client-side state machine** that lives in `app/page.tsx` (the one stateful component). This is the authoritative reference for *what state exists, when it changes, and what renders*. Component internals (bubbles, sheet, composer, onboarding) are specified in their own docs.

### Source files specified
- `web/app/layout.tsx` — RootLayout, metadata, viewport.
- `web/app/page.tsx` — `Home` client page: all state, handlers, conditional render tree.
- `web/app/globals.css` — base reset, Pretendard font, `.skeleton` / `.no-scrollbar` / `.pb-safe`.
- `web/next.config.js` — `reactStrictMode` + `/api/*` rewrite (single-origin proxy).

### Related docs (do not duplicate)
- **`00-OVERVIEW.md`** — exact dependency versions, npm scripts, config files, env vars (`BACKEND_URL`, `NEXT_PUBLIC_API_URL`).
- **`01-DESIGN-SYSTEM.md`** — `tailwind.config.ts` tokens (colors, radii, shadows), Pretendard font, type scale, spring params, `globals.css` utilities.
- **`04-COMPONENTS.md`** — `ChatBubble`, `Composer`, `Markdown`, `TypingDots`, `Onboarding`, `ReceiptSheet` internals + motion params.
- **`03-API-CONTRACT.md`** — `lib/api.ts` (`verifyReceipt`, `streamChat`), backend HTTP/streaming contracts.
- **`07-TYPES.md`** — full `lib/types.ts` (`Message`, `ChatTurn`, `VerifyResult`, `SEVERITY_META`, …).
- **`06-COPY-KO.md`** — every Korean UI string in one place. Strings quoted here are verbatim and load-bearing.

---

## 1. Next.js App Router shell

App Router, `app/` directory, no `pages/`. There are exactly two route files: `app/layout.tsx` (root layout) and `app/page.tsx` (the single route `/`). `globals.css` is imported once, at the top of `layout.tsx`.

### 1.1 `layout.tsx` — RootLayout

```tsx
export const metadata: Metadata = {
  title: "SpendSentry",
  description: "Sentri AI 지출결의서 컴플라이언스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // NO maximumScale — pinch-zoom allowed (WCAG 1.4.4)
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans bg-toss-bg">{children}</body>
    </html>
  );
}
```

Hard requirements (all load-bearing):

| Item | Value | Why |
|---|---|---|
| `<html lang>` | `"ko"` | Korean UI; screen-reader pronunciation. |
| `metadata.title` | `"SpendSentry"` | Browser tab. |
| `metadata.description` | `"Sentri AI 지출결의서 컴플라이언스"` | Verbatim. |
| `viewport.width` | `"device-width"` | |
| `viewport.initialScale` | `1` | |
| `viewport.maximumScale` | **omitted** | Allowing pinch-zoom is intentional (WCAG 1.4.4). Do **not** add `maximumScale` or `userScalable: false`. |
| `viewport.viewportFit` | `"cover"` | Extends under notch/home-bar; pairs with `.pb-safe` safe-area padding. |
| `<body>` classes | `font-sans bg-toss-bg` | `font-sans` → Pretendard (see 1.3); `bg-toss-bg` = `#f2f4f6` fills the whole viewport (full-bleed app surface). |

`metadata` and `viewport` are separate exports (Next 14 splits `viewport` out of `metadata`). Both typed `import type { Metadata, Viewport } from "next"`.

### 1.2 `next.config.js` — single-origin `/api` proxy

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

- `reactStrictMode: true` — note the consequence below (effects fire twice in dev).
- The **rewrite** maps every `/api/:path*` request to `${BACKEND_URL}/api/:path*` (default `http://localhost:8000`). The browser therefore only ever calls **relative** `/api/...` URLs — one public origin (tunnel) serves both UI and API, no CORS.
- `BACKEND_URL` is a **server-side** env var read at the Next server. For a *split* deploy the client can instead point at an absolute base via `NEXT_PUBLIC_API_URL` (consumed in `lib/api.ts`; see `03-API-CONTRACT.md`). Default for both: empty/relative.

> **StrictMode caveat:** in dev, `Home`'s mount effects run twice. The unmount-abort cleanup (§5) makes this safe — the first `AbortController` is just aborted. Do not "fix" double-firing by removing StrictMode.

### 1.3 `globals.css` — base layer

Order matters: `@tailwind base; @tailwind components; @tailwind utilities;` then the Pretendard `@import`.

- **Font:** Pretendard loaded via CDN `@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard-dynamic-subset.css")`. `font-sans` in `tailwind.config.ts` maps to Pretendard (see `01-DESIGN-SYSTEM.md`).
- **Reset:** `html, body { padding:0; margin:0; background:#f2f4f6; color:#191f28; -webkit-font-smoothing:antialiased }` and `* { box-sizing:border-box }`.
- **`.skeleton`** — shimmer placeholder. `@keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }`; `.skeleton { background: linear-gradient(90deg,#eef1f4 25%,#e2e6ea 37%,#eef1f4 63%); background-size:800px 100%; animation: shimmer 1.4s ease infinite }`. Used by the verifying skeleton (§6).
- **`.no-scrollbar`** — hides scrollbars: `::-webkit-scrollbar{display:none}` + `-ms-overflow-style:none; scrollbar-width:none`. Applied to the scroll area.
- **`.pb-safe`** — `padding-bottom: max(1.5rem, env(safe-area-inset-bottom))`. Used by the pinned `Composer` so iOS gesture bar never covers the input.

---

## 2. Responsive container model

One column, full-bleed background, content centered. There is **no** fixed phone-width frame — the app surface fills the viewport and each *region* re-centers its own content at `max-w-3xl`.

Root tree of `Home`:

```
<div className="flex flex-col h-[100dvh]">     ← root: full dynamic-viewport height, column
  <header className="bg-toss-bg"> … </header>  ← app-bar (region 1)
  <div ref=scrollRef
       className="flex-1 overflow-y-auto no-scrollbar">   ← scroll area (region 2), grows
    <div className="mx-auto w-full max-w-3xl min-h-full px-4 py-3 flex flex-col gap-3">
      … onboarding / messages / busy indicator / bottomRef sentinel …
    </div>
  </div>
  <div aria-live="polite" className="sr-only">{live}</div>   ← SR live region
  <Composer … />                                ← pinned input bar (region 3)
  <ReceiptSheet … />                            ← portal/overlay sheet
</div>
```

Rules:

| Concern | How |
|---|---|
| Full height | Root `h-[100dvh]` (dynamic viewport unit — survives mobile URL-bar collapse). `flex flex-col`. |
| Region centering | Each region wraps its content in `mx-auto w-full max-w-3xl`. The header uses `... px-5 pt-3 pb-3.5`; the scroll inner uses `... px-4 py-3 flex flex-col gap-3`. |
| Scroll area grows | Middle `<div>` is `flex-1 overflow-y-auto no-scrollbar` — takes remaining height, scrolls internally, hidden scrollbar. |
| Onboarding centering | Inner wrapper carries **`min-h-full`** so when there are no messages the onboarding can vertically fill/center within the scroll area instead of collapsing to its content height. |
| Composer pinned | `Composer` is the last flex child (after the scroll area), so it sits at the bottom of the column, always visible; it owns `.pb-safe`. |
| Message stacking | Messages render inside the `flex flex-col gap-3` inner wrapper → uniform 0.75rem vertical gap. |

---

## 3. State model (`app/page.tsx` → `Home`)

`Home` is the **only** stateful component (`"use client"`). It holds all chat state and orchestrates both API calls. State is a deliberate mix of React state (drives render) and refs (mutable, must not trigger render).

### 3.1 State & refs table

| Name | Kind | Type / init | Role |
|---|---|---|---|
| `messages` | `useState` | `Message[]` = `[]` | Rendered timeline. **Empty array ⇒ onboarding renders** (no seeded greeting). Discriminated union, see §3.2. |
| `historyRef` | `useRef` | `ChatTurn[]` = `[]` | LLM conversation context sent to `/api/chat`. **Not** the same as `messages` (carries injected receipt summaries; excludes image/error/receipt-card entries). Truncated to last `MAX_HISTORY_TURNS`. |
| `abortRef` | `useRef` | `AbortController \| null` = `null` | Controls the in-flight `streamChat`. Used to (a) cancel on a new send so responses don't interleave, (b) `stop()` button, (c) `goHome()`, (d) unmount. |
| `busy` | `useState` | `boolean` = `false` | True for the whole duration of `handleSubmit` (verify and/or chat). Disables `Composer`, hides onboarding, shows the busy indicator, drives stop/send toggle. |
| `verifying` | `useState` | `boolean` = `false` | True only while `verifyReceipt` (OCR) is awaited. Selects **skeleton vs `TypingDots`** inside the busy block. |
| `sheet` | `useState` | `VerifyResult \| null` = `null` | The receipt result shown in `ReceiptSheet`. `null` ⇒ closed. |
| `live` | `useState` | `string` = `""` | `aria-live="polite"` announcement text. Set **only on turn completion** (full assistant text), never per-token. |
| `scrollRef` | `useRef` | `HTMLDivElement` | The scroll viewport (region 2). |
| `bottomRef` | `useRef` | `HTMLDivElement` | Empty sentinel `<div>` at list end; `scrollIntoView` target for auto-scroll. |
| `composerRef` | `useRef` | `ComposerHandle` | Imperative handle so onboarding's CTA / attach can call `composerRef.current?.openFilePicker()`. |

Module-level constants:

```ts
const uid = () => crypto.randomUUID();        // message ids
const MAX_HISTORY_TURNS = 20;                  // caps /api/chat context growth
```

`MAX_HISTORY_TURNS = 20` — **why:** chat history is replayed to the model every turn; without a cap it grows unbounded and eventually exceeds the token limit. History is truncated with `.slice(-MAX_HISTORY_TURNS)` after every append (keeps the most recent 20 turns).

### 3.2 `Message` discriminated union (rendered timeline)

Defined in `lib/types.ts` (full detail in `07-TYPES.md`). Discriminant = `kind`:

```ts
type Message =
  | { id: string; kind: "text";    role: "user" | "assistant"; content: string }
  | { id: string; kind: "receipt"; role: "assistant";          result: VerifyResult }
  | { id: string; kind: "image";   role: "user";               url: string; name: string }
  | { id: string; kind: "error";   role: "assistant";          content: string; retry: { text: string; file: File | null } };
```

Every message has a `crypto.randomUUID()` `id` (React key + the target for streaming in-place updates). `ChatTurn` (`{ role: "user"|"assistant"; content: string }`) is the *separate* LLM-context type stored in `historyRef`.

### 3.3 Effects

```ts
// auto-scroll to the latest content whenever messages or busy change
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
}, [messages, busy]);

// abort any in-flight stream on unmount
useEffect(() => () => abortRef.current?.abort(), []);
```

- Auto-scroll deps are `[messages, busy]` — so the view follows new bubbles, every streamed token (each token mutates `messages`), and the appearance/disappearance of the busy indicator.
- The unmount cleanup aborts the live stream (also the StrictMode double-mount safety, §1.2).

---

## 4. Handlers (exact behavior)

### 4.1 `callChat(userContent: string)`

Streams one assistant turn and appends it to `historyRef`.

1. Build `turns = [...historyRef.current, { role: "user", content: userContent }]`.
2. Allocate `aid = uid()`, `acc = ""`, `started = false`.
3. **Abort any prior stream**: `abortRef.current?.abort()` (prevents two streams writing concurrently → interleaved text). Create a fresh `AbortController`, store in `abortRef`.
4. `await streamChat(turns, onToken, ac.signal)` where `onToken(tok)`:
   - `acc += tok`.
   - **First token** (`!started`): set `started`, **push** a new assistant bubble `{ id: aid, kind: "text", role: "assistant", content: acc }`. (Bubble is created lazily on first token, so `TypingDots` shows until text actually starts.)
   - **Subsequent tokens**: map over `messages`, replacing the bubble whose `m.id === aid && m.kind === "text"` with `{ ...m, content: acc }` (in-place grow).
5. After the stream: `historyRef.current = [...turns, { role: "assistant", content: acc }].slice(-MAX_HISTORY_TURNS)`.
6. `setLive(acc)` — announce the completed assistant text to screen readers (once, not per token).

`streamChat` reads a `text/plain` body via a reader + `TextDecoder` and forwards raw token chunks (not SSE, not JSON) — see `03-API-CONTRACT.md`.

### 4.2 `handleSubmit(text: string, file: File | null, isRetry = false)`

The central orchestrator. Called by the `Composer` (`onSend`), onboarding presets (`onAsk(q) → handleSubmit(q, null)`), and the error bubble's retry (`handleSubmit(retry.text, retry.file, true)`).

**Step A — render the user's own message** (skipped entirely when `isRetry`, so retries don't duplicate the user bubble):
- If `file`: `url = await fileToDataUrl(file)`; push `{ id: uid(), kind: "image", role: "user", url, name: file.name }`.
- If `text`: push `{ id: uid(), kind: "text", role: "user", content: text }`.

**Step B — `setBusy(true)`**, then a `try / catch / finally`:

Branching on inputs (inside `try`):

| Inputs | Behavior |
|---|---|
| **file present** | (1) `setVerifying(true)`; `result = await verifyReceipt(file)` inside an inner `try/finally` that always `setVerifying(false)`. (2) Push a `receipt` message `{ kind:"receipt", role:"assistant", result }`. (3) `setSheet(result)` — auto-opens the sheet. (4) `summary = receiptSummary(result)`, then sub-branch below. |
| → file **+ text** | `await callChat(\`${summary}\n\n사용자 질문: ${text}\`)` — receipt facts + the user's question go to the LLM together. |
| → file only, `verdict === "REVIEW"` | `await callChat(\`${summary}\n\n영수증을 판독하지 못했습니다. 사용자에게 금액·상호가 보이도록 다시 첨부해 달라고 짧고 친절하게 안내해줘.\`)` — chat also nudges re-attach (visible even if the sheet is closed). |
| → file only, PASS/FAIL | **No LLM call.** Manually append two synthetic turns to `historyRef` so a later follow-up remembers the receipt: user turn = `summary`; assistant turn = `\`영수증 검증 완료: ${result.verdict}${result.violations.length ? \` (위반 ${result.violations.length}건)\` : " (위반 없음)"}. 추가로 궁금한 점을 물어보세요.\``. Then `historyRef.current = next.slice(-MAX_HISTORY_TURNS)`. |
| **text only** (no file) | `await callChat(text)`. |
| neither | nothing runs. |

**Step C — `catch (err)`**:
- If `err instanceof DOMException && err.name === "AbortError"` → **`return`** silently (user pressed stop / a newer send aborted this one; not an error).
- Otherwise map the error message prefix to user copy and push an `error` message carrying `retry: { text, file }`:

| `err.message` starts with | Pushed `content` (verbatim) |
|---|---|
| `"verify-receipt"` | `⚠️ 영수증을 인식하지 못했어요. 이미지(금액·상호가 보이도록)를 다시 첨부해 주세요.` |
| `"chat"` | `⚠️ AI 응답에 실패했어요. 잠시 후 다시 시도해 주세요.` |
| anything else | `⚠️ 서버에 연결하지 못했어요. 백엔드(:8000)·API 키를 확인해 주세요.` |

(Prefixes come from `lib/api.ts` which throws `Error("verify-receipt: …")` / `Error("chat: …")`.)

**Step D — `finally { setBusy(false) }`** (always clears busy, even on abort-return path — `finally` still runs).

### 4.3 `stop()`
`abortRef.current?.abort(); setBusy(false);` — cancels the live stream. The resulting `AbortError` is swallowed by `handleSubmit`'s catch (`return`). Any tokens already streamed remain in the assistant bubble.

### 4.4 `goHome()` — full reset to onboarding
Called by the header logo/title button (`aria-label="SpendSentry · 처음 화면으로"`). Resets everything:
```ts
abortRef.current?.abort();   // kill in-flight stream
setBusy(false);
setVerifying(false);
setMessages([]);             // ⇒ onboarding re-renders
historyRef.current = [];     // wipe LLM context
setSheet(null);              // close receipt sheet
setLive("");                 // clear SR live region
```

### 4.5 Pure helpers

- **`fileToDataUrl(file): Promise<string>`** — wraps `FileReader.readAsDataURL`, resolving with the **data URL**. *Why data URL, not `URL.createObjectURL`:* an object URL stored in message state has no clear revoke point → memory leak. Data URLs need no manual release, so they're safe to keep in `messages` for the life of the conversation. (The `Composer` *preview* chip is the opposite case — it uses an object URL and revokes it on change; see `04-COMPONENTS.md`.)

- **`receiptSummary(r: VerifyResult): string`** — flattens a verify result into LLM context text so multi-turn follow-ups remember the receipt. Exact lines (joined with `\n`):
  ```
  [방금 첨부한 영수증 판독 결과]
  - 금액: ₩{amount.toLocaleString()}            // amount ?? 0
  - 지출일: {date || "—"}
  - 결제수단: {payment_method || "—"} / 증빙: {evidence_type || "—"} / 업종: {category || "—"}
  - 택시: {origin || "—"} → {destination || "—"} · {ride_datetime || "—"}   // only if ride_datetime || origin
  - 규칙 검증 판정: {verdict}
  - 위반: {violations.map(v => `${v.rule} ${v.item}`).join("; ")}            // or "- 위반 없음" if none
  ```

- **`failLabel(counts: Record<Severity, number>): string`** — builds the FAIL chip label from severity counts. Iterates `Object.keys(SEVERITY_META)` (order: `심각`, `주의`, `누락`), keeps severities with `counts[s] > 0`, maps each to `` `${SEVERITY_META[s].label} ${counts[s]}` ``, joins with `" · "`. Result: `` `❌ FAIL · ${parts.join(" · ")}` `` or, if no parts, `"❌ FAIL"`. `SEVERITY_META` (in `lib/types.ts`) is the single source of truth for severity labels/colors, shared with `ReceiptSheet` (see `04-COMPONENTS.md` / `07-TYPES.md`).

---

## 5. AbortController & stream-lifecycle invariants

There is at most **one** live stream, tracked by `abortRef`. It is aborted in four situations:

1. **New send** — `callChat` calls `abortRef.current?.abort()` before opening a new stream (dedupes overlapping streams; prevents interleaved tokens).
2. **Stop button** — `stop()`.
3. **Go home** — `goHome()`.
4. **Unmount** — `useEffect(() => () => abortRef.current?.abort(), [])`.

Every abort surfaces as a `DOMException` named `"AbortError"`, which `handleSubmit`'s catch detects and treats as a non-error (`return`). Partial streamed text is preserved in its bubble.

---

## 6. Conditional render tree (what shows when)

Inside the scroll inner wrapper, in document order:

1. **Onboarding** — rendered iff `messages.length === 0 && !busy`:
   ```tsx
   <Onboarding onAsk={(q) => handleSubmit(q, null)} onAttach={() => composerRef.current?.openFilePicker()} />
   ```
   (`onAsk` fires a preset question as a text-only submit; `onAttach` opens the file picker via the composer handle. See `04-COMPONENTS.md`.)

2. **Message list** — `messages.map(m => …)`, switched on `m.kind`:

   | `kind` | Render |
   |---|---|
   | `"text"` | `<ChatBubble role={m.role}>`. Assistant → `<Markdown>{m.content}</Markdown>`; user → raw `m.content` string (the bubble itself handles `whitespace-pre-wrap`). |
   | `"error"` | `<ChatBubble role="assistant">` with `m.content` (in `text-toss-ink`) + a **다시 시도** button → `handleSubmit(m.retry.text, m.retry.file, true)`, `disabled={busy}`. Button classes: `mt-2 rounded-2xl bg-toss-bg px-4 py-2 text-[14px] font-bold text-toss-blue active:scale-95 transition-transform disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue`. |
   | `"image"` | A right-aligned `motion.div` (`flex justify-end`) animating `initial {opacity:0,y:14,scale:0.96}` → `animate {opacity:1,y:0,scale:1}`, `transition {type:"spring",stiffness:500,damping:30}`, wrapping `<img src={m.url} alt="첨부한 영수증 이미지" className="max-w-[60%] rounded-4xl shadow-toss" />`. |
   | `"receipt"` | `<ChatBubble role="assistant">` containing a tap-to-open `<button onClick={() => setSheet(m.result)} aria-label="영수증 검증 상세 보기">`. Inside: a verdict chip line `text-[18px] font-extrabold ${chip.ink}` and a subline `text-[14px] text-toss-gray mt-0.5` = `` `₩${(amount??0).toLocaleString()} · ${payment_method || "—"} · 탭하여 상세` ``. |

   Verdict chip mapping (for `kind:"receipt"`):
   | `verdict` | `chip.ink` | `chip.label` |
   |---|---|---|
   | `"PASS"` | `text-toss-blue` | `✅ PASS` |
   | `"REVIEW"` | `text-toss-yellow` | `🔎 검증 불가` |
   | `"FAIL"` | `text-toss-red` | `failLabel(m.result.counts)` (e.g. `❌ FAIL · 심각 1 · 주의 2`) |

3. **Busy indicator** — wrapped in `<AnimatePresence>`; renders iff `busy`. The wrapper is a `motion.div` with `initial {opacity:0}` / `animate {opacity:1}` / `exit {opacity:0}`. Inside, **branch on `verifying`**:
   - `verifying === true` → **skeleton** (mimics a receipt chip): a `role="status" aria-label="영수증을 판독하는 중입니다"` container `bg-toss-card rounded-4xl rounded-tl-lg shadow-toss px-5 py-4 w-fit` holding two `.skeleton` bars — `skeleton h-5 w-24 rounded-lg mb-2` and `skeleton h-3.5 w-40 rounded`.
   - else → `<TypingDots />`.

4. **`<div ref={bottomRef} />`** — scroll sentinel (always last).

### 6.1 Outside the scroll area
- **SR live region**: `<div aria-live="polite" className="sr-only">{live}</div>` — only updated on turn completion (`setLive(acc)` in `callChat`); never per token, so screen readers aren't spammed.
- **`<Composer ref={composerRef} disabled={busy} onSend={handleSubmit} onStop={stop} />`** — pinned input bar; `disabled` while busy; `onStop` wires the stop button to `stop()`.
- **`<ReceiptSheet result={sheet} onClose={() => setSheet(null)} />`** — bottom-sheet overlay; `result === null` ⇒ closed.

---

## 7. Accessibility invariants (architecture level)

- Pinch-zoom allowed (no `maximumScale`) — §1.1.
- `aria-live="polite"` announces only completed assistant turns — §6.1.
- Skeleton and `TypingDots` carry `role="status"` so progress is announced.
- Header reset button has `aria-label="SpendSentry · 처음 화면으로"`; receipt card has `aria-label="영수증 검증 상세 보기"`; attached image has `alt="첨부한 영수증 이미지"`.
- Focus-visible rings (`focus-visible:ring-2 focus-visible:ring-toss-blue`) on every interactive element in this file.
- In-flight stream is aborted on unmount (no setState-after-unmount, no orphaned fetch).

---

## 8. Reconstruction checklist

- [ ] `app/layout.tsx`: `lang="ko"`, exact title/description, viewport with `viewportFit:"cover"` and **no** `maximumScale`, body `font-sans bg-toss-bg`.
- [ ] `next.config.js`: `reactStrictMode:true` + `/api/:path*` rewrite to `BACKEND_URL || http://localhost:8000`.
- [ ] `globals.css`: tailwind layers, Pretendard `@import`, base reset, `.skeleton`/`.no-scrollbar`/`.pb-safe`.
- [ ] `Home`: state set `{ messages, busy, verifying, sheet, live }` + refs `{ historyRef, abortRef, scrollRef, bottomRef, composerRef }`; `MAX_HISTORY_TURNS=20`.
- [ ] Two effects: auto-scroll on `[messages,busy]`, abort on unmount.
- [ ] `callChat` lazy-pushes assistant bubble on first token, grows in place, slices history, sets `live`.
- [ ] `handleSubmit` full branch matrix (file±text, REVIEW vs PASS/FAIL, text-only) + abort-aware catch + error copy mapping + `retry` payload.
- [ ] `goHome` full reset; `stop` abort; helpers `fileToDataUrl` (data URL), `receiptSummary`, `failLabel`.
- [ ] Render tree: onboarding gate (`length===0 && !busy`), kind switch, busy block (skeleton vs TypingDots), bottom sentinel, SR live region, pinned Composer, ReceiptSheet.
