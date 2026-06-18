# 05 — Screens & User Flows (State Transitions)

This is the authoritative spec for SpendSentry's runtime behavior: the two screens (home/onboarding and chat+sheet) and the end-to-end flows as explicit state transitions. An AI reading only this doc must be able to reconstruct how the app *behaves* — what state changes on each action, which indicator shows when, which composer button is active, and how multi-turn memory, errors, retries, stop, and go-home work.

Scope note: this doc covers **flows and state**. Component markup/styling details live in their own docs; cross-reference where relevant:
- Component anatomy & props → see `04-COMPONENTS.md` (or the per-component docs).
- Design tokens / Tailwind config → see `01-DESIGN-SYSTEM.md`.
- API request/response shapes → see `03-API-CONTRACT.md`.
- All Korean UI copy (verbatim) → see `06-COPY-KO.md`.
- Types (`Message`, `VerifyResult`, `SEVERITY_META`, …) → see `07-TYPES.md`.

## Source files specified
- `web/app/page.tsx` — `Home`: owns all state, orchestrates every flow.
- `web/components/Onboarding.tsx` — empty-state category grid + receipt CTA.
- `web/components/ReceiptSheet.tsx` — bottom-sheet verdict detail modal.
- `web/components/Composer.tsx` — bottom input bar (`forwardRef` → `openFilePicker`).
- `web/lib/api.ts` — `verifyReceipt` (multipart) + `streamChat` (plain-text token stream).

---

## 1. State model (the single source of truth)

All app state lives in the `Home` component (`page.tsx`). Reconstruct exactly these:

| Name | Decl | Type | Purpose |
|---|---|---|---|
| `messages` | `useState` | `Message[]` | The rendered conversation. Initial value `[]` (empty → onboarding shows). |
| `historyRef` | `useRef` | `ChatTurn[]` | LLM context sent to `/api/chat`. Holds user/assistant turns **plus injected receipt summaries** for multi-turn memory. Initial `[]`. |
| `abortRef` | `useRef` | `AbortController \| null` | Cancels the in-flight `streamChat`. Initial `null`. |
| `busy` | `useState` | `boolean` | True while any request (verify and/or chat) is in flight. Drives TypingDots/skeleton **and** Composer's send↔stop toggle. |
| `verifying` | `useState` | `boolean` | True only during the `verifyReceipt` OCR wait. When true (and busy), the **skeleton** shows instead of TypingDots. |
| `sheet` | `useState` | `VerifyResult \| null` | The receipt result currently shown in the bottom sheet. `null` = sheet closed. |
| `scrollRef` | `useRef` | `HTMLDivElement` | The scroll viewport (`overflow-y-auto`). |
| `bottomRef` | `useRef` | `HTMLDivElement` | Empty sentinel `<div>` at list end; scrolled into view on updates. |
| `composerRef` | `useRef` | `ComposerHandle` | Lets onboarding CTA call `composerRef.current.openFilePicker()`. |
| `live` | `useState` | `string` | `aria-live="polite"` announcement, updated **only on turn completion** (never per-token). |

Module constants/helpers (define verbatim):
- `const uid = () => crypto.randomUUID();`
- `const MAX_HISTORY_TURNS = 20;` — caps `historyRef` to avoid unbounded `/api/chat` context. Applied as `next.slice(-MAX_HISTORY_TURNS)` after every turn.
- `fileToDataUrl(file)` → reads file as a **data URL** (via `FileReader.readAsDataURL`). Used for persisted message images so there is no objectURL to revoke (no leak).
- `receiptSummary(result)` → builds the LLM-context text block (see §6).
- `failLabel(counts)` → builds the FAIL chip label with severity breakdown (see §4).

### Effects
- Auto-scroll: `useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, busy])`. Runs on every message change AND on busy toggling (so the typing indicator is scrolled into view).
- Unmount cleanup: `useEffect(() => () => abortRef.current?.abort(), [])` — aborts any live stream when the page unmounts.

### Derived UI gating
- Onboarding renders **iff** `messages.length === 0 && !busy`.
- The busy indicator block renders **iff** `busy` (wrapped in `<AnimatePresence>`), and inside it: `verifying ? <skeleton/> : <TypingDots/>`.

---

## 2. Screen A — Home / Onboarding (first impression)

### Layout (ASCII wireframe)
```
┌─────────────────────────────────────────────┐
│ 🧾  SpendSentry                  ● 온라인     │  ← <header>, max-w-3xl, button=goHome
│     Sentri AI 컴플라이언스                    │
├─────────────────────────────────────────────┤
│                                             │
│  무엇을 검증할까요?                          │  ← Onboarding (vertically centered)
│  카테고리를 고르면 규정을 안내해 드려요.      │
│                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│  ← grid-cols-2 md:grid-cols-4
│  │ 🍚      │ │ 🚕      │ │ 🤝      │ │ ✈️      ││
│  │ 식대    │ │ 교통    │ │ 접대    │ │ 출장    ││
│  │점심·저녁│ │택시·야근│ │청탁금지 │ │정산·승인││
│  └────────┘ └────────┘ └────────┘ └────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 🧾  영수증 바로 검증하기              › ││  ← blue CTA → onAttach → openFilePicker
│  │     이미지를 첨부하면 즉시 판정          ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│ ＋ │ 메시지 입력 또는 영수증 첨부      │ ↑   │  ← Composer (send button = idle state)
└─────────────────────────────────────────────┘
```

### Header (inline `<header>` in `page.tsx` — there is NO `Header.tsx`)
- Centered at `max-w-3xl`; background `bg-toss-bg`.
- Left: a `<button onClick={goHome} aria-label="SpendSentry · 처음 화면으로">` wrapping the 🧾 logo tile, `SpendSentry` (span), and subtitle `Sentri AI 컴플라이언스`. Tapping it triggers **go-home reset** (§9), from anywhere.
- Right: a non-interactive status pill — green dot (`bg-[#16c47f]`) + text `온라인`.

### Onboarding content (verbatim copy — keep exactly)
- Heading: `무엇을 검증할까요?`
- Sub: `카테고리를 고르면 규정을 안내해 드려요.`
- 4 category tiles (`CATEGORIES` array, in order). Tapping a tile calls `onAsk(c.q)` → `handleSubmit(c.q, null)`:

| key | icon | tile bg | label | sub | preset question `q` (sent verbatim) |
|---|---|---|---|---|---|
| `meal` | 🍚 | `bg-[#fff4e6]` | 식대 | 점심·저녁·야근 | `점심 식대 한도가 궁금해요` |
| `transit` | 🚕 | `bg-[#e8f3ff]` | 교통 | 택시·야근 이동 | `야근 택시비 규정 알려주세요` |
| `entertain` | 🤝 | `bg-[#fdeef0]` | 접대 | 청탁금지법 한도 | `접대비 한도가 궁금해요` |
| `trip` | ✈️ | `bg-[#eafaf1]` | 출장 | 정산·승인 절차 | `출장비 정산 절차가 궁금해요` |

- Blue CTA below the grid: title `영수증 바로 검증하기`, sub `이미지를 첨부하면 즉시 판정`, trailing `›`. `onClick={onAttach}` → `composerRef.current?.openFilePicker()` (opens the OS file picker; see §4).
- Enter animation: `motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{type:"spring",stiffness:400,damping:32}}`, container `flex-1 flex flex-col justify-center` (so it sits centered in the scroll area).

### Transitions out of Home
- Tap any category tile → ASK-BY-CATEGORY flow (§3).
- Type + send in Composer → FREE-TEXT flow (§3).
- Tap CTA or Composer `＋` → RECEIPT VERIFY flow (§4).
- The moment `messages.length > 0` OR `busy` becomes true, Onboarding unmounts (first user bubble / indicator replaces it).

---

## 3. Flow — Text chat (category preset OR free text)

Both paths converge on `handleSubmit(text, null)` then `callChat(text)`. They are identical except for how `text` originates.

### Entry
- **ASK-BY-CATEGORY:** tile tap → `onAsk(q)` → `handleSubmit(q, null)`.
- **FREE-TEXT:** user types in the textarea. Send is triggered by:
  - `Enter` (without Shift) → `e.preventDefault()` + `send()`.
  - `Shift+Enter` → inserts a newline (no send).
  - Tapping the `↑` send button.
  - `send()` guards: returns early if `disabled` OR (`!text.trim() && !file`). On send it calls `onSend(text.trim(), file)`, then clears `text`, clears the file/preview (`pick(null)`), and resets textarea height to `auto`.

### Step-by-step state transitions
1. `handleSubmit(text, null, isRetry=false)` runs. `file` is null, `isRetry` false → push a user text bubble: `messages += { id, kind:"text", role:"user", content:text }`.
2. `setBusy(true)`. → Composer button flips to **stop (square)**; onboarding (if present) unmounts; the busy block mounts. Since `verifying` is false, **TypingDots** shows (left-aligned, `role=status`).
3. `await callChat(text)`:
   - `turns = [...historyRef.current, { role:"user", content:text }]`.
   - `abortRef.current?.abort()` (cancel any prior stream), then new `AbortController` → `abortRef.current = ac`.
   - `await streamChat(turns, onToken, ac.signal)`.
   - **First token:** create exactly ONE assistant bubble: `messages += { id:aid, kind:"text", role:"assistant", content:acc }`. (TypingDots stays until busy clears.)
   - **Subsequent tokens:** mutate that same bubble by id: map over messages, replace `content` with the accumulated `acc`. The bubble grows in place — never a new bubble per token.
   - On stream end: `historyRef.current = [...turns, {role:"assistant", content:acc}].slice(-MAX_HISTORY_TURNS)`; `setLive(acc)` (screen-reader announcement of the full answer).
4. `finally { setBusy(false) }` → busy block unmounts (TypingDots gone), Composer button flips back to **send (↑)**.

Assistant text bubbles render markdown via `<Markdown>` (react-markdown + remark-gfm). User text bubbles render raw string (whitespace preserved).

### `streamChat` contract (do not deviate — see `03-API-CONTRACT.md`)
- `POST /api/chat`, `Content-Type: application/json`, body `{ messages }`, passes `signal`.
- Throws `Error("chat: <status>")` if `!res.ok || !res.body`.
- Response is **raw plain-text token chunks** (`text/plain`), NOT SSE/JSON. Read `res.body.getReader()` + `TextDecoder`; for each `{done,value}` call `onToken(decoder.decode(value,{stream:true}))`. On finish, `reader.cancel()`.

---

## 4. Flow — Receipt verify (image, possibly with text)

### Entry — opening the file picker
- Onboarding CTA → `onAttach()` → `composerRef.current.openFilePicker()`.
- Composer `＋` button → `fileRef.current?.click()`.
- Both target the **same** `<input type="file">`. Critical constraints:
  - `accept="image/png,image/jpeg"` (PNG/JPEG only).
  - Styled `sr-only` (NOT `hidden`/`display:none`) + `tabIndex={-1}` — because Safari/iOS block programmatic `.click()` on hidden inputs.
  - `openFilePicker` is exposed via `useImperativeHandle(ref, () => ({ openFilePicker: () => fileRef.current?.click() }))`.

### Selecting a file → preview chip
1. `onChange`: `const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""`. The value reset lets re-picking the *same* file fire `onChange` again.
2. `pick(f)`: revoke any previous preview objectURL, then `URL.createObjectURL(f)` for the new preview; `setFile(f)`. (Preview uses **objectURL** and is revoked on change/clear — leak-safe. The persisted message image later uses a **data URL** instead; see §1.)
3. Composer shows the **preview chip** (animated in): thumbnail + text `영수증 첨부됨` + `✕` remove button (`aria-label="첨부 제거"`, calls `pick(null)`).
4. Textarea placeholder switches to `영수증에 대해 물어보세요 (예: 확인해줘)` while a file is attached (otherwise `메시지 입력 또는 영수증 첨부`).
5. With a file attached, the send button is enabled even if text is empty (guard is `!text.trim() && !file`).

### Send → state transitions
`send()` → `onSend(text.trim(), file)` → `handleSubmit(text, file, false)`:

1. Not a retry, `file` present → push **user image bubble** first: `fileToDataUrl(file)` then `messages += { id, kind:"image", role:"user", url, name }`. The image renders right-aligned (`max-w-[60%] rounded-4xl shadow-toss`) with its own spring entrance.
2. If `text` is also non-empty → also push the user text bubble (`kind:"text", role:"user"`). (Order: image bubble, then text bubble.)
3. `setBusy(true)` → Composer flips to **stop**.
4. `setVerifying(true)` → the busy block now shows the **verifying skeleton** (verdict-chip-shaped, `role="status"`, `aria-label="영수증을 판독하는 중입니다"`: a `skeleton h-5 w-24` line over a `skeleton h-3.5 w-40` line), NOT TypingDots.
5. `result = await verifyReceipt(file)` inside `try/finally`; the `finally` always `setVerifying(false)` (so even on error the skeleton clears).
6. On success: push the **assistant receipt bubble**: `messages += { id, kind:"receipt", role:"assistant", result }`, and `setSheet(result)` (this is what makes the bottom sheet open).
7. Branch by whether `text` was provided and by verdict (see §5 and §6 for REVIEW/text branches). When no text and verdict ≠ REVIEW, no chat call is made; instead a synthetic summary turn is pushed into `historyRef` (so follow-ups remember the receipt — §6).
8. `finally { setBusy(false) }`.

### The receipt chip (in the `kind:"receipt"` bubble)
The bubble is a full-width `<button onClick={() => setSheet(m.result)} aria-label="영수증 검증 상세 보기">` (tapping it **reopens** the sheet). It shows a bold verdict line + a sub-line `₩{amount} · {payment_method || "—"} · 탭하여 상세`. Verdict → chip:

| verdict | chip ink class | chip label |
|---|---|---|
| `PASS` | `text-toss-blue` | `✅ PASS` |
| `REVIEW` | `text-toss-yellow` | `🔎 검증 불가` |
| `FAIL` | `text-toss-red` | `failLabel(counts)` |

`failLabel(counts)`: iterate severities in `SEVERITY_META` key order, keep those with `counts[s] > 0`, map each to `` `${SEVERITY_META[s].label} ${counts[s]}` ``, join with ` · `. Result = `` `❌ FAIL · ${parts.join(" · ")}` `` or, if no parts, `"❌ FAIL"`. (Severity keys are Korean: `심각`/`주의`/`누락`; `SEVERITY_META` is the single source of truth, shared with ReceiptSheet — see `07-TYPES.md`.)

### Bottom sheet — AUTO-OPEN and details
- Auto-open: setting `sheet` (step 6) renders `<ReceiptSheet result={sheet}>`, which animates up via `motion` (`initial y:"100%"` → `animate y:0`, spring `stiffness:380, damping:36`). The visible slide-up reads as "opens shortly after the verdict appears" (~380ms-feel from the spring), so the user sees the chip, then the sheet rises.
- Reopen: tap the chip button → `setSheet(m.result)` again.
- Close: `onClose` (`setSheet(null)`) from — the dim backdrop click, the `확인` button, `Escape`, or drag-down past threshold.
- Drag-to-dismiss: `drag="y"`, `dragConstraints={{top:0,bottom:0}}`, `dragElastic={{top:0,bottom:0.4}}`, `onDragEnd={(_,info) => info.offset.y > 120 && onClose()}` (drag down >120px closes).
- Accessibility: `role="dialog" aria-modal="true" aria-label="영수증 검증 결과" tabIndex={-1}`; on open, focus moves to the sheet (`requestAnimationFrame` → `sheetRef.focus()`), saving `document.activeElement`; on close, focus returns to the saved trigger. `onKeyDown`: `Escape` → close; `Tab`/`Shift+Tab` cycle within the sheet's focusables (focus trap).

### Sheet content
- Verdict banner (centered): big icon + title + subtitle, colored by verdict:
  | verdict | bg | ink | icon | title | subtitle |
  |---|---|---|---|---|---|
  | PASS | `bg-blue-50` | `text-toss-blue` | ✅ | `PASS` | `회사 룰 충족` |
  | FAIL | `bg-red-50` | `text-toss-red` | ❌ | `FAIL` | `위반 {n}건` |
  | REVIEW | `bg-orange-50` | `text-toss-yellow` | 🔎 | `검증 불가` | `영수증을 판독하지 못했어요 · 다시 첨부해 주세요` |
- Metric grid (2 cols): `금액` (`₩{amount.toLocaleString()}` or `—`), `결제수단`, `업종`, `증빙` (each `value || "—"`).
- Taxi row (only if `r.ride_datetime || r.origin`): `🚕 {origin} → {destination} · 🕐 {ride_datetime}` (each field `|| "—"`).
- Violation cards (only if `violations.length > 0`), one per violation, staggered in: `transition={{ delay: 0.1 + i*0.06, type:"spring", stiffness:400, damping:30 }}`. Card bg/dot/icon/label come from `SEVERITY_META[v.severity]`. Card shows: severity dot + `` `${s.icon} ${s.label} · ${v.rule} · ${v.rule_tag}` `` header, then bold `v.item`, then gray `v.detail`.
- Footer button `확인` (full-width blue) → `onClose`.

### `verifyReceipt` contract (see `03-API-CONTRACT.md`)
- `POST /api/verify-receipt`, body = `FormData` with field `file`.
- On `!res.ok`: read JSON `body`, throw `Error("verify-receipt: " + (body?.detail ?? res.status))`.
- On success: `res.json()` → `VerifyResult`.

---

## 5. REVIEW semantics (unreadable image ≠ pass)

When OCR cannot read the receipt the backend returns `verdict: "REVIEW"`. This is a distinct third state — never silently treated as PASS.

- The receipt chip shows `🔎 검증 불가` in `text-toss-yellow` (not a pass/blue, not a fail/red).
- The sheet banner shows `🔎 검증 불가` with subtitle `영수증을 판독하지 못했어요 · 다시 첨부해 주세요`.
- **Chat guidance even without text:** in `handleSubmit`, when `file` present, no `text`, and `result.verdict === "REVIEW"`, the app calls `callChat` with:
  ```
  {summary}\n\n영수증을 판독하지 못했습니다. 사용자에게 금액·상호가 보이도록 다시 첨부해 달라고 짧고 친절하게 안내해줘.
  ```
  So the assistant produces a friendly re-attach prompt in the chat even if the user never opens the sheet. (If the user DID provide text, the combined text+image branch runs instead — §6 — and the LLM still sees `verdict: REVIEW` in the summary.)

---

## 6. TEXT + IMAGE combined & multi-turn memory

The receipt result is summarized into LLM context so later questions "remember" it. Three branches after a successful verify (all after pushing the receipt bubble + `setSheet`):

1. **Text + image** (`text` truthy): `await callChat(`${summary}\n\n사용자 질문: ${text}`)`. The LLM receives the receipt facts plus the user's question and answers in natural language; that turn is appended to `historyRef`.
2. **Image only, REVIEW**: the re-attach guidance call from §5.
3. **Image only, PASS/FAIL**: NO chat request. Instead push two synthetic turns into `historyRef` directly so follow-ups have context:
   - `{ role:"user", content: summary }`
   - `{ role:"assistant", content: `영수증 검증 완료: ${verdict}${violations.length ? ` (위반 ${n}건)` : " (위반 없음)"}. 추가로 궁금한 점을 물어보세요.` }`
   Then `historyRef = next.slice(-MAX_HISTORY_TURNS)`.

`receiptSummary(result)` builds the injected context block (verbatim format):
```
[방금 첨부한 영수증 판독 결과]
- 금액: ₩{amount.toLocaleString() | 0}
- 지출일: {date | "—"}
- 결제수단: {payment_method | "—"} / 증빙: {evidence_type | "—"} / 업종: {category | "—"}
[- 택시: {origin|—} → {destination|—} · {ride_datetime|—}]   ← only if ride_datetime || origin
- 규칙 검증 판정: {verdict}
- 위반: {v.rule v.item; ...}   ← OR "- 위반 없음" if none
```
Because these summaries live in `historyRef`, a subsequent free-text question (e.g. "이거 왜 위반이야?") is sent with the receipt context already present → the model answers about that specific receipt. `historyRef` is always capped to the last `MAX_HISTORY_TURNS` (20) entries.

---

## 7. Error + retry

`handleSubmit` wraps the work in `try/catch/finally`.

- **AbortError is not an error:** `if (err instanceof DOMException && err.name === "AbortError") return;` — a user-initiated stop/cancel exits silently (no error bubble), `finally` still runs `setBusy(false)`.
- **Real errors** → push `{ id, kind:"error", role:"assistant", content, retry:{ text, file } }`. The `content` is chosen by error-message prefix:
  | error prefix | bubble copy (verbatim) |
  |---|---|
  | `verify-receipt` | `⚠️ 영수증을 인식하지 못했어요. 이미지(금액·상호가 보이도록)를 다시 첨부해 주세요.` |
  | `chat` | `⚠️ AI 응답에 실패했어요. 잠시 후 다시 시도해 주세요.` |
  | (anything else / network) | `⚠️ 서버에 연결하지 못했어요. 백엔드(:8000)·API 키를 확인해 주세요.` |
- The error bubble renders the copy + a `다시 시도` button (`disabled={busy}`). It calls `handleSubmit(m.retry.text, m.retry.file, true)`.
- **Retry does not duplicate the user message:** `isRetry=true` skips step 1/2 (the image/text user bubbles are NOT pushed again); it re-runs only the request side (verify and/or chat) using the captured `retry.text`/`retry.file`.

---

## 8. Stop (abort in-flight stream)

- While `busy`, the Composer's right button is the **stop** button (`bg-toss-ink`, white square glyph, `aria-label="생성 중지"`, `whileTap scale 0.88`). It calls `onStop` → `stop()`.
- `stop()`: `abortRef.current?.abort(); setBusy(false);`. Aborting the signal makes the in-flight `fetch`/reader throw `AbortError`, which `handleSubmit`'s catch swallows (§7). Any tokens already streamed into the assistant bubble remain visible (partial answer is kept).
- Aborts also fire automatically: at the start of each new `callChat` (`abortRef.current?.abort()` before creating a new controller), on `goHome`, and on unmount.

---

## 9. Go-home (full reset)

Tapping the header logo button (`aria-label="SpendSentry · 처음 화면으로"`) calls `goHome()`:
```
abortRef.current?.abort();   // cancel any live stream
setBusy(false);
setVerifying(false);
setMessages([]);             // → messages.length===0 && !busy → Onboarding remounts
historyRef.current = [];     // drop multi-turn memory
setSheet(null);              // close the bottom sheet if open
setLive("");                 // clear screen-reader region
```
After this the app is back at Screen A (Home/Onboarding), with no history, no open sheet, idle Composer.

---

## 10. State → indicator/button mapping (STATE TABLE)

The app has three meaningful runtime modes derived from `busy` + `verifying`:

| Mode | `busy` | `verifying` | Onboarding | Busy indicator shown | Composer right button | Notes |
|---|---|---|---|---|---|---|
| **idle** | `false` | `false` | shown iff `messages.length===0` | none | **send** `↑` (`bg-toss-blue`; disabled when `!text.trim() && !file`) | normal input state |
| **busy (chat)** | `true` | `false` | hidden | **TypingDots** (`role=status`, left-aligned) | **stop** ■ (`bg-toss-ink`) | streaming an assistant answer (first token may have already created the growing bubble) |
| **verifying** | `true` | `true` | hidden | **skeleton** chip (`role=status`, `aria-label="영수증을 판독하는 중입니다"`) | **stop** ■ | OCR/rule wait; flips to busy(chat) afterward if a follow-up `callChat` runs |

Invariants:
- `verifying === true` implies `busy === true` (verifying is a sub-phase of busy).
- The indicator block exists only while `busy`; inside it, `verifying ? skeleton : TypingDots`.
- Composer button is **send** iff `!busy`, **stop** iff `busy` (driven by the `disabled` prop = `busy`).
- A receipt+text send goes idle → verifying → (busy chat) → idle.

---

## 11. Chat + sheet screen (ASCII wireframe)

```
┌─────────────────────────────────────────────┐
│ 🧾  SpendSentry                  ● 온라인     │
│     Sentri AI 컴플라이언스                    │
├─────────────────────────────────────────────┤
│                       ┌──────────────────┐  │
│                       │ [영수증 이미지]   │  │  ← user image bubble (right, max-w-60%)
│                       └──────────────────┘  │
│                       ┌──────────────────┐  │
│                       │ 이거 확인해줘      │  │  ← user text bubble (right, blue)
│                       └──────────────────┘  │
│  ┌──────────────────────────┐               │
│  │ ❌ FAIL · 심각 1 · 주의 2 │               │  ← receipt chip bubble (left), tap=reopen
│  │ ₩48,000 · 법인카드 · 탭…  │               │
│  └──────────────────────────┘               │
│  ┌──────────────────────────┐               │
│  │ (assistant markdown 답변) │               │  ← streamed text bubble (left, white)
│  └──────────────────────────┘               │
│  ● ● ●   ← TypingDots while busy             │
├─────────────────────────────────────────────┤
│ ＋ │ 메시지 입력 또는 영수증 첨부      │ ■   │  ← stop button while busy
└─────────────────────────────────────────────┘
        ▼ ReceiptSheet slides up over all ▼
   ┌───────────────────────────────────────┐
   │              ──────  (drag handle)     │
   │            ❌                          │
   │           FAIL                         │
   │         위반 3건                        │
   │  ┌──────────┐ ┌──────────┐            │  ← metric grid (금액/결제수단/업종/증빙)
   │  │ 금액      │ │ 결제수단  │            │
   │  └──────────┘ └──────────┘            │
   │  🚕 출발지 → 도착지 · 🕐 시각          │  ← taxi row (conditional)
   │  ┌───────────────────────────────────┐│
   │  │ ● 심각 · 규칙 · 태그              ││  ← violation card (staggered in)
   │  │ {item}                            ││
   │  │ {detail}                          ││
   │  └───────────────────────────────────┘│
   │  [           확인           ]          │
   └───────────────────────────────────────┘
```

Layout shell (all flows): outer `div.flex.flex-col.h-[100dvh]`; header / scroll area / Composer each centered at `max-w-3xl` on a full-bleed `bg-toss-bg`. Scroll area is `flex-1 overflow-y-auto no-scrollbar` with an inner `min-h-full px-4 py-3 flex flex-col gap-3`. The `aria-live="polite"` region is an `sr-only` div between the scroll area and the Composer, updated only via `setLive` on turn completion. The sheet (`fixed`, `z-50`, dim backdrop `z-40`) overlays everything.
