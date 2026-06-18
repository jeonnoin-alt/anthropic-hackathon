# 06 — Korean UI Copy (verbatim)

Authoritative, character-for-character reference for **every** user-facing string in the SpendSentry web frontend: visible Korean text, emoji, placeholders, `title`/`aria-label` attributes, document metadata, and the dynamic strings injected into the chat history. Reproduce these **exactly** — same characters, spacing, punctuation, middots (`·`), arrows (`→`/`›`), and emoji.

This doc is the single source of truth for strings only. For structure/behavior/layout/styling of each surface, see the sibling docs (e.g. component contracts, design tokens). Severity meta (`SEVERITY_META`) and the `Message`/`VerifyResult` type shapes are reproduced here only where the copy depends on them.

## Source files specified
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/app/layout.tsx` — document metadata.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/app/page.tsx` — header app-bar, receipt chip, skeleton/typing aria, error bubbles, retry, dynamic chat-history strings.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/components/Onboarding.tsx` — empty-state screen + category presets + CTA.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/components/Composer.tsx` — input bar placeholders, title attr, aria-labels, preview chip.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/components/ReceiptSheet.tsx` — bottom-sheet verdict banner, metrics, taxi row, violation cards, CTA.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/lib/types.ts` — `Severity` keys + `SEVERITY_META` (icon/label).

---

## 1. Document metadata — `app/layout.tsx`

| String | Field | Notes |
| --- | --- | --- |
| `SpendSentry` | `metadata.title` | Browser tab title; brand is Latin, no localization. |
| `Sentri AI 지출결의서 컴플라이언스` | `metadata.description` | NOTE: this is the **description** meta — it includes `지출결의서`, unlike the header subtitle (§2) which is the shorter `Sentri AI 컴플라이언스`. Do not conflate the two. |

`<html lang="ko">`. No other text in layout.

---

## 2. Header app-bar — inline in `app/page.tsx`

The header is **not** a separate component; it lives inline in `page.tsx`. (There is no `Header.tsx`.)

| String | Where it appears | Notes |
| --- | --- | --- |
| `🧾` | Logo tile (38×38, `bg-[#e8f3ff]`, `text-[20px]`) | Receipt emoji. |
| `SpendSentry` | `<span>` title, `text-[17px] font-extrabold` | Brand. |
| `Sentri AI 컴플라이언스` | Subtitle under title, `text-[12px] text-toss-gray` | Shorter than the metadata description (§1). |
| `온라인` | Status pill (right side), `text-[12px] font-bold text-toss-gray`, preceded by a green dot `bg-[#16c47f]` | Literally "Online". |

**Header aria-labels**

| String | Element | Notes |
| --- | --- | --- |
| `SpendSentry · 처음 화면으로` | `aria-label` on the logo/title `<button>` | Triggers `goHome()` full reset. Lit. "to the first screen". |

---

## 3. Onboarding empty state — `components/Onboarding.tsx`

Shown only when `messages.length === 0 && !busy`. Grid is `grid-cols-2 md:grid-cols-4`.

### 3.1 Heading + subhead

| String | Element | Notes |
| --- | --- | --- |
| `무엇을 검증할까요?` | `<h2>`, `text-[21px] font-extrabold` | "What shall we verify?" |
| `카테고리를 고르면 규정을 안내해 드려요.` | `<p>`, `text-[13px] text-toss-gray` | Trailing period included. |

### 3.2 Category tiles (4) — `CATEGORIES` array

Each tile is a button. On tap it sends `q` verbatim via `onAsk(q)` → `handleSubmit(q, null)` → `/api/chat`. The `q` strings are **user-visible** (they render as a user bubble) and must be exact.

| key | icon | label (`text-[15px] font-bold`) | sub (`text-[12px] text-toss-gray`) | question sent `q` (verbatim) | tile bg |
| --- | --- | --- | --- | --- | --- |
| `meal` | `🍚` | `식대` | `점심·저녁·야근` | `점심 식대 한도가 궁금해요` | `bg-[#fff4e6]` |
| `transit` | `🚕` | `교통` | `택시·야근 이동` | `야근 택시비 규정 알려주세요` | `bg-[#e8f3ff]` |
| `entertain` | `🤝` | `접대` | `청탁금지법 한도` | `접대비 한도가 궁금해요` | `bg-[#fdeef0]` |
| `trip` | `✈️` | `출장` | `정산·승인 절차` | `출장비 정산 절차가 궁금해요` | `bg-[#eafaf1]` |

Notes:
- The `sub` strings use the middot `·` (U+00B7), not a comma.
- `청탁금지법` = the Korean Improper Solicitation and Graft Act (no translation in UI).
- Order is exactly meal → transit → entertain → trip.

### 3.3 Receipt CTA (blue button at bottom)

| String | Element | Notes |
| --- | --- | --- |
| `🧾` | Icon tile (`bg-white/20`) | |
| `영수증 바로 검증하기` | CTA title, `text-[15.5px] font-extrabold text-white` | "Verify a receipt right now". Calls `onAttach()` → opens file picker. |
| `이미지를 첨부하면 즉시 판정` | CTA sub, `text-[12.5px] text-white/80` | "Attach an image for instant judgment". No trailing period. |
| `›` | Chevron, `text-[20px] text-white/85` | U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK. |

---

## 4. Composer (bottom input bar) — `components/Composer.tsx`

### 4.1 Textarea placeholder (conditional)

The placeholder switches on whether a file is staged (`file`):

| Condition | Placeholder string | Notes |
| --- | --- | --- |
| no file staged | `메시지 입력 또는 영수증 첨부` | Default. "Enter a message or attach a receipt". |
| file staged | `영수증에 대해 물어보세요 (예: 확인해줘)` | Parentheses + example. "Ask about the receipt (e.g., check it)". |

Source contract:
```tsx
placeholder={file ? "영수증에 대해 물어보세요 (예: 확인해줘)" : "메시지 입력 또는 영수증 첨부"}
```

### 4.2 Textarea `title` (keyboard hint tooltip)

| String | Attribute | Notes |
| --- | --- | --- |
| `Enter 전송 · Shift+Enter 줄바꿈` | `title` on the `<textarea>` | Native tooltip. Middot `·` separates the two hints. Enter = send, Shift+Enter = newline. |

### 4.3 Preview chip (shown when an image is staged)

| String | Element | Notes |
| --- | --- | --- |
| `영수증 첨부됨` | Chip label, `text-[13px] text-toss-gray` | "Receipt attached". |
| `✕` | Remove button glyph | U+2715 MULTIPLICATION X (not the letter x, not `×` U+00D7). |
| `＋` | Attach button glyph | U+FF0B FULLWIDTH PLUS SIGN (fullwidth, not ASCII `+`). |
| `↑` | Send button glyph | U+2191 UPWARDS ARROW. |

### 4.4 Composer aria-labels

| String | Element | Notes |
| --- | --- | --- |
| `첨부` | Attach (`＋`) button `aria-label` | "Attach". |
| `메시지 입력` | `<textarea>` `aria-label` | "Message input". |
| `첨부 제거` | Remove-attachment (`✕`) button `aria-label` | "Remove attachment". |
| `전송` | Send (`↑`) button `aria-label` | Shown when **not** busy. "Send". |
| `생성 중지` | Stop button `aria-label` | Shown when busy (`disabled`); the stop button replaces send and renders a white square, not a glyph string. "Stop generating". |

---

## 5. Chat message surfaces — `app/page.tsx`

### 5.1 Receipt result chip (assistant bubble, `kind: "receipt"`)

Tapping the chip reopens the bottom sheet. The chip's main label depends on `verdict`; the subtext is a fixed format.

**Verdict label (main line, `text-[18px] font-extrabold`)**

| verdict | label string | ink class |
| --- | --- | --- |
| `PASS` | `✅ PASS` | `text-toss-blue` |
| `REVIEW` | `🔎 검증 불가` | `text-toss-yellow` |
| `FAIL` | `failLabel(counts)` — see below | `text-toss-red` |

`failLabel(counts)` builds the FAIL string from the severity counts, iterating `SEVERITY_META` key order (심각 → 주의 → 누락), including only severities with `count > 0`:

```ts
// parts joined by " · "; each part is `${label} ${count}`
// e.g. counts {심각:2, 주의:1, 누락:0}  →  "❌ FAIL · 심각 2 · 주의 1"
// if no positive counts                  →  "❌ FAIL"
```

| Resulting form | When |
| --- | --- |
| `❌ FAIL · 심각 N · 주의 N · 누락 N` | one segment per severity with a positive count, in fixed order, joined by ` · `. |
| `❌ FAIL` | fallback when all counts are 0. |

Emoji are part of the strings: `✅` (U+2705), `🔎` (U+1F50E), `❌` (U+274C).

**Chip subtext (`text-[14px] text-toss-gray mt-0.5`)** — fixed format:

```tsx
₩{(amount ?? 0).toLocaleString()} · {payment_method || "—"} · 탭하여 상세
```

| Token | Value | Notes |
| --- | --- | --- |
| `₩` | won sign U+20A9 | prefixes amount. |
| amount | `(amount ?? 0).toLocaleString()` | thousands-grouped; `0` if null. |
| ` · ` | separator | middot with surrounding spaces. |
| payment_method | `payment_method || "—"` | em-dash `—` (U+2014) fallback when empty. |
| `탭하여 상세` | trailing literal | "Tap for details". |

Example: `₩48,000 · 법인카드 · 탭하여 상세`.

### 5.2 Loading states (while `busy`)

| String | Element | Notes |
| --- | --- | --- |
| `영수증을 판독하는 중입니다` | `aria-label` on the receipt-skeleton `role="status"` div (shown while `verifying`) | "Reading the receipt". The skeleton itself shows no visible text (shimmer bars only). |
| `AI가 답변을 작성 중입니다` | `role="status"` label for the `TypingDots` indicator (shown while streaming, `busy && !verifying`) | "The AI is composing a reply". Lives in `TypingDots.tsx`; included here for completeness. |

### 5.3 Image bubble (`kind: "image"`)

| String | Element | Notes |
| --- | --- | --- |
| `첨부한 영수증 이미지` | `alt` on the user's attached-image `<img>` | "Attached receipt image". |

### 5.4 Error bubbles (`kind: "error"`) + retry

`handleSubmit`'s catch maps the error to one of three messages by inspecting `err.message`. `AbortError` is **not** an error (user pressed stop) and produces no bubble.

| Condition (`err.message` prefix) | Bubble string (verbatim) |
| --- | --- |
| starts with `verify-receipt` | `⚠️ 영수증을 인식하지 못했어요. 이미지(금액·상호가 보이도록)를 다시 첨부해 주세요.` |
| starts with `chat` | `⚠️ AI 응답에 실패했어요. 잠시 후 다시 시도해 주세요.` |
| otherwise (e.g. network/server down) | `⚠️ 서버에 연결하지 못했어요. 백엔드(:8000)·API 키를 확인해 주세요.` |

Notes:
- All three begin with `⚠️ ` (U+26A0 + variation selector U+FE0F + a single space).
- First message: parenthetical `(금액·상호가 보이도록)` uses a middot; ends with a period.
- Third message: `백엔드(:8000)·API 키` — literal port `:8000` in parens, middot before `API 키`.

**Retry button** (rendered inside the error bubble):

| String | Element | Notes |
| --- | --- | --- |
| `다시 시도` | Retry `<button>`, `text-[14px] font-bold text-toss-blue` | Calls `handleSubmit(retry.text, retry.file, true)`. "Try again". |

### 5.5 Receipt-chip aria-label

| String | Element | Notes |
| --- | --- | --- |
| `영수증 검증 상세 보기` | `aria-label` on the receipt-chip `<button>` | "View receipt verification details". Opens the bottom sheet. |

---

## 6. Bottom sheet (receipt detail) — `components/ReceiptSheet.tsx`

`role="dialog"`, `aria-modal="true"`. Drag-to-dismiss, Esc to close, focus trap.

### 6.1 Sheet aria-label

| String | Element | Notes |
| --- | --- | --- |
| `영수증 검증 결과` | `aria-label` on the dialog | "Receipt verification result". |

### 6.2 Verdict banner (`vstyle` + `subtitle`)

Big icon (`text-[40px]`), title (`text-[24px] font-extrabold`), subtitle (`text-[14px] text-toss-gray`).

| verdict | icon | title | subtitle | banner bg / ink |
| --- | --- | --- | --- | --- |
| `PASS` | `✅` | `PASS` | `회사 룰 충족` | `bg-blue-50` / `text-toss-blue` |
| `FAIL` | `❌` | `FAIL` | `위반 N건` (N = `result.violations.length`, fallback `0`) | `bg-red-50` / `text-toss-red` |
| `REVIEW` | `🔎` | `검증 불가` | `영수증을 판독하지 못했어요 · 다시 첨부해 주세요` | `bg-orange-50` / `text-toss-yellow` |

Notes:
- PASS/FAIL titles are Latin `PASS`/`FAIL`; only REVIEW's title is Korean `검증 불가`.
- `회사 룰 충족` = "Meets company rules" (uses loanword `룰`).
- `위반 N건` — N interpolated, e.g. `위반 2건`. Counter unit `건`.
- REVIEW subtitle uses a middot ` · ` between the two clauses: `영수증을 판독하지 못했어요 · 다시 첨부해 주세요`.

### 6.3 Metric grid (2×2)

`<Metric label value>` — label is `text-[13px] text-toss-gray`, value is `text-[17px] font-bold`.

| label (verbatim) | value source | empty fallback |
| --- | --- | --- |
| `금액` | `₩${r.amount.toLocaleString()}` when `amount` truthy | `—` |
| `결제수단` | `r.payment_method` | `—` (`|| "—"`) |
| `업종` | `r.category` | `—` (`|| "—"`) |
| `증빙` | `r.evidence_type` | `—` (`|| "—"`) |

Order is fixed: 금액 → 결제수단 → 업종 → 증빙. Fallback glyph is em-dash `—` (U+2014). `금액` value prefixes `₩`.

### 6.4 Taxi row (conditional)

Rendered only when `r.ride_datetime || r.origin` is truthy. `text-[15px] text-toss-ink`.

```tsx
🚕 <b>{origin || "—"}</b> → <b>{destination || "—"}</b>
<span className="text-toss-gray"> · 🕐 {ride_datetime || "—"}</span>
```

| Token | Value | Notes |
| --- | --- | --- |
| `🚕` | taxi emoji (U+1F695) | leading. |
| origin / destination | bold; `—` fallback | |
| ` → ` | arrow U+2192 with spaces | between origin and destination. |
| ` · 🕐 ` | middot + clock emoji (U+1F550) | precedes datetime. |
| ride_datetime | `—` fallback | |

Example: `🚕 강남역 → 판교 · 🕐 2026-06-16 23:40`.

### 6.5 Violation cards (per `Violation`)

Each card header line (`text-[13px] font-semibold text-toss-gray`) is:

```tsx
{s.icon} {s.label} · {v.rule} · {v.rule_tag}
```

where `s = SEVERITY_META[v.severity]` (see §7). Then:

| Element | Source | Class |
| --- | --- | --- |
| Item title | `v.item` | `text-[16px] font-bold text-toss-ink` |
| Detail | `v.detail` | `text-[14px] text-toss-gray leading-relaxed` |

The header static text is only the two ` · ` separators; `rule`, `rule_tag`, `item`, `detail` are backend-supplied (Korean from the rule engine — not hardcoded in the frontend). Example header: `🔴 심각 · 식대 한도 · MEAL_LIMIT`.

### 6.6 Sheet CTA

| String | Element | Notes |
| --- | --- | --- |
| `확인` | Bottom button, `text-[17px] font-bold text-white bg-toss-blue` | "Confirm" / "OK". Calls `onClose()`. |

---

## 7. Severity meta — `lib/types.ts` (`SEVERITY_META`)

Single source of truth for severity icon + label + colors. Severity keys are **Korean** (`Severity = "심각" | "주의" | "누락"`). Reused by both the FAIL chip (§5.1) and violation cards (§6.5). Iteration/display order = object key order below.

| Severity key | icon | label | dot | bg | meaning |
| --- | --- | --- | --- | --- | --- |
| `심각` | `🔴` | `심각` | `bg-toss-red` | `bg-red-50` | critical |
| `주의` | `🟡` | `주의` | `bg-toss-yellow` | `bg-orange-50` | warning |
| `누락` | `📋` | `누락` | `bg-toss-blue` | `bg-blue-50` | missing/omitted |

Emoji codepoints: `🔴` U+1F534, `🟡` U+1F7E1, `📋` U+1F4CB. Note `label` equals the key for all three.

```ts
export type Severity = "심각" | "주의" | "누락";
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red", bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue", bg: "bg-blue-50" },
};
```

---

## 8. Dynamic chat-history strings (sent to `/api/chat`, not directly rendered)

These are constructed in `page.tsx` and pushed into the LLM context so multi-turn follow-ups remember the receipt. They are **not** chat bubbles, but they are Korean text the AI sees and must be reproduced exactly (they shape the assistant's replies). Rebuild them verbatim.

### 8.1 `receiptSummary(r)` — receipt summarized for LLM context

Built line-by-line, joined by `\n`:

| Line template (verbatim) | Notes |
| --- | --- |
| `[방금 첨부한 영수증 판독 결과]` | header line. |
| `- 금액: ₩${(amount ?? 0).toLocaleString()}` | |
| `- 지출일: ${date || "—"}` | |
| `- 결제수단: ${payment_method || "—"} / 증빙: ${evidence_type || "—"} / 업종: ${category || "—"}` | slash-separated. |
| `- 택시: ${origin || "—"} → ${destination || "—"} · ${ride_datetime || "—"}` | only if `ride_datetime || origin`. |
| `- 규칙 검증 판정: ${verdict}` | verdict is PASS/FAIL/REVIEW. |
| `- 위반: ` + violations joined by `; ` as `${rule} ${item}` | if `violations.length`. |
| `- 위반 없음` | else branch. |

### 8.2 Composite prompts sent with the summary

| Scenario | String sent to `callChat` (verbatim) |
| --- | --- |
| receipt + user text | `${summary}\n\n사용자 질문: ${text}` |
| receipt only, verdict `REVIEW` | `${summary}\n\n영수증을 판독하지 못했습니다. 사용자에게 금액·상호가 보이도록 다시 첨부해 달라고 짧고 친절하게 안내해줘.` |

### 8.3 Synthetic assistant turn (receipt only, PASS/FAIL — no user text)

When a receipt is attached without text and verdict is **not** REVIEW, a fake assistant turn is pushed to history (so the next follow-up has context). Not rendered:

```
영수증 검증 완료: ${verdict}${violations.length ? ` (위반 ${violations.length}건)` : " (위반 없음)"}. 추가로 궁금한 점을 물어보세요.
```

| Resulting form | When |
| --- | --- |
| `영수증 검증 완료: PASS (위반 없음). 추가로 궁금한 점을 물어보세요.` | no violations |
| `영수증 검증 완료: FAIL (위반 3건). 추가로 궁금한 점을 물어보세요.` | violations present |

---

## 9. Glyph / punctuation cheat sheet

Reproduce these exact codepoints — common AI substitution mistakes are flagged.

| Glyph | Codepoint | Used in | Do NOT substitute with |
| --- | --- | --- | --- |
| `·` | U+00B7 (middle dot) | subs, chip subtext, separators, error msgs | `•` U+2022, `.`, `,` |
| `—` | U+2014 (em dash) | all empty-value fallbacks | `-` hyphen, `–` en dash |
| `→` | U+2192 (rightwards arrow) | taxi row, receiptSummary | `->`, `›` |
| `›` | U+203A | onboarding CTA chevron | `>`, `→` |
| `₩` | U+20A9 (won sign) | amounts | `W`, `KRW` |
| `＋` | U+FF0B (fullwidth plus) | attach button | ASCII `+` |
| `↑` | U+2191 (up arrow) | send button | `^` |
| `✕` | U+2715 | remove-attachment | `x`, `×` U+00D7, `✖` |
| `⚠️` | U+26A0 U+FE0F | error bubbles (3) | bare `⚠` without VS-16 |
| `✅` | U+2705 | PASS chip/banner | `☑`, `✔` |
| `❌` | U+274C | FAIL chip/banner | `✗`, `x` |
| `🔎` | U+1F50E | REVIEW chip/banner | `🔍` U+1F50D |
| `🧾` | U+1F9FE | header logo, onboarding CTA | `🧮`, `📄` |

---

## 10. Coverage checklist (every Korean/emoji string, by surface)

- **layout**: `SpendSentry`, `Sentri AI 지출결의서 컴플라이언스`.
- **header**: `🧾`, `SpendSentry`, `Sentri AI 컴플라이언스`, `온라인`; aria `SpendSentry · 처음 화면으로`.
- **onboarding**: `무엇을 검증할까요?`, `카테고리를 고르면 규정을 안내해 드려요.`; tiles `식대`/`점심·저녁·야근`, `교통`/`택시·야근 이동`, `접대`/`청탁금지법 한도`, `출장`/`정산·승인 절차`; presets `점심 식대 한도가 궁금해요`, `야근 택시비 규정 알려주세요`, `접대비 한도가 궁금해요`, `출장비 정산 절차가 궁금해요`; CTA `영수증 바로 검증하기`, `이미지를 첨부하면 즉시 판정`, `›`; emoji `🍚 🚕 🤝 ✈️ 🧾`.
- **composer**: placeholders `메시지 입력 또는 영수증 첨부`, `영수증에 대해 물어보세요 (예: 확인해줘)`; title `Enter 전송 · Shift+Enter 줄바꿈`; chip `영수증 첨부됨`; glyphs `＋ ↑ ✕`; aria `첨부`, `메시지 입력`, `첨부 제거`, `전송`, `생성 중지`.
- **chat (page)**: chip labels `✅ PASS`, `🔎 검증 불가`, `❌ FAIL [· 심각 N · 주의 N · 누락 N]`; subtext `… · … · 탭하여 상세`; aria `영수증 검증 상세 보기`, `영수증을 판독하는 중입니다`, `AI가 답변을 작성 중입니다`; image alt `첨부한 영수증 이미지`; errors (3 ⚠️ messages) + `다시 시도`.
- **sheet**: aria `영수증 검증 결과`; banners `PASS`/`회사 룰 충족`, `FAIL`/`위반 N건`, `검증 불가`/`영수증을 판독하지 못했어요 · 다시 첨부해 주세요`; metrics `금액 결제수단 업종 증빙`; taxi `🚕 … → … · 🕐 …`; CTA `확인`; preview/attach alts `첨부한 영수증 미리보기`.
- **severity**: `심각`/`🔴`, `주의`/`🟡`, `누락`/`📋`.
- **dynamic (LLM context)**: §8 receiptSummary lines, composite prompts, synthetic assistant turn.
