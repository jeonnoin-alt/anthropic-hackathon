# 07 — TypeScript Data Model (`lib/types.ts`)

The complete, canonical TypeScript contract for the SpendSentry frontend. Every type
here mirrors a FastAPI response model in `api/main.py`; the file `web/lib/types.ts` is
the **single source of truth** for shapes and for severity display metadata. Rebuild
this file verbatim before building any component — `lib/api.ts`, `app/page.tsx`,
`ReceiptSheet.tsx`, and `ChatBubble.tsx` all import from it.

**Source files specified**
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/lib/types.ts` (the file to rebuild)
- `/Users/jeon-younghoon/Desktop/Git/hackertone/api/main.py` (backend models that MUST stay in sync)
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/app/page.tsx` (primary consumer)

Sibling docs: API client, streaming, and the wire contract → see `03-API-CONTRACT.md`;
page/app state machine → see `02-ARCHITECTURE-AND-STATE.md`; component behavior
(`ChatBubble`, `ReceiptSheet`, `Composer`) → see `04-COMPONENTS.md`; runtime flows
(REVIEW re-attach, retry, streaming) → see `05-FLOWS-AND-SCREENS.md`; Korean UI strings →
see `06-COPY-KO.md`; Tailwind tokens (`toss-*` colors, `rounded-4xl`) → see
`01-DESIGN-SYSTEM.md`.

---

## 1. Canonical type block (rebuild verbatim)

This is the **entire** contents of `web/lib/types.ts`. Reproduce exactly — characters,
Korean keys, emoji, and Tailwind class strings are all load-bearing.

```ts
export type Severity = "심각" | "주의" | "누락";

/** 심각도별 표시 메타 (이모지·라벨·색상) — 단일 진실 공급원. */
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red", bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue", bg: "bg-blue-50" },
};

export interface Violation {
  severity: Severity;
  rule: string;
  rule_tag: string;
  item: string;
  detail: string;
}

export interface ReceiptData {
  amount: number | null;
  date: string | null;
  vendor: string;
  category: string;
  payment_method: string;
  evidence_type: string;
  ride_datetime: string;
  origin: string;
  destination: string;
}

export interface VerifyResult {
  verdict: "PASS" | "FAIL" | "REVIEW";
  receipt: ReceiptData;
  violations: Violation[];
  counts: Record<Severity, number>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type Message =
  | { id: string; kind: "text"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "receipt"; role: "assistant"; result: VerifyResult }
  | { id: string; kind: "image"; role: "user"; url: string; name: string }
  | { id: string; kind: "error"; role: "assistant"; content: string; retry: { text: string; file: File | null } };
```

No default export, no runtime logic beyond the `SEVERITY_META` constant. All other
exports are `type` / `interface` (erased at compile time).

---

## 2. `Severity` — Korean-keyed union

```ts
export type Severity = "심각" | "주의" | "누락";
```

The three severity levels of a rule violation, keyed by **Korean string literals** (not
enums, not English). These exact strings come straight from the backend
(`ViolationOut.severity` is a `str` carrying these values) — never translate or alias.

| Value | Meaning | Used as object key in |
|-------|---------|------------------------|
| `"심각"` | Critical | `SEVERITY_META`, `VerifyResult.counts` |
| `"주의"` | Warning  | `SEVERITY_META`, `VerifyResult.counts` |
| `"누락"` | Missing / not provided | `SEVERITY_META`, `VerifyResult.counts` |

Because `Severity` is the key type of both `SEVERITY_META` and `counts`, iterating
`Object.keys(SEVERITY_META)` (cast `as Severity[]`) gives a stable, ordered list of all
severities — this is how `page.tsx` builds the FAIL chip (see §6).

---

## 3. `SEVERITY_META` — single source of truth for severity display

```ts
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red", bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue", bg: "bg-blue-50" },
};
```

The **only** place severity icon/label/colors are defined. Both `page.tsx` (FAIL chip
counts) and `ReceiptSheet.tsx` (violation cards) read from here — do NOT hardcode emoji
or colors anywhere else. Exact per-severity values:

| `Severity` key | `icon` | `label` | `dot` (Tailwind) | `bg` (Tailwind) |
|----------------|--------|---------|------------------|-----------------|
| `심각` | `🔴` | `심각` | `bg-toss-red` | `bg-red-50` |
| `주의` | `🟡` | `주의` | `bg-toss-yellow` | `bg-orange-50` |
| `누락` | `📋` | `누락` | `bg-toss-blue` | `bg-blue-50` |

Field semantics:

| Field | Type | Purpose / where rendered |
|-------|------|---------------------------|
| `icon` | `string` (emoji) | Leading glyph on a violation card / chip. |
| `label` | `string` | Human label; equals the key (Korean). Shown in FAIL chip as `${label} ${count}`. |
| `dot` | `string` | Tailwind bg-color class for the small status dot on violation cards. |
| `bg` | `string` | Tailwind bg-color class for the violation card's tinted background. |

Notes:
- `dot` mixes design tokens (`bg-toss-red`, `bg-toss-yellow`, `bg-toss-blue` — defined in
  `tailwind.config.ts`, see `01-DESIGN-SYSTEM.md`) and `bg` uses **stock Tailwind**
  palette classes (`bg-red-50`, `bg-orange-50`, `bg-blue-50`). This asymmetry is
  intentional — copy it exactly.
- `주의` deliberately pairs a yellow dot with an **orange-50** background (not
  `bg-yellow-50`). Keep as written.
- These class strings are **literals consumed by Tailwind's content scanner** — they
  must appear verbatim in source so JIT emits them. Do not build them dynamically.

---

## 4. Backend ↔ frontend mirror map

The frontend types must stay in sync with the Pydantic response models in
`api/main.py`. The `/api/verify-receipt` endpoint returns `VerifyResult` which the
frontend deserializes directly into the TS `VerifyResult`.

| Backend (`api/main.py`) | Frontend (`lib/types.ts`) | Sync note |
|-------------------------|----------------------------|-----------|
| `ViolationOut` | `Violation` | Field-for-field identical (5 fields). |
| `ReceiptOut`   | `ReceiptData` | `amount: Optional[int]` → `number \| null`; `date: Optional[str]` → `string \| null`. All other fields non-null `str`. |
| `VerifyResult` (Pydantic) | `VerifyResult` (TS) | `verdict: str` → narrowed TS union `"PASS" \| "FAIL" \| "REVIEW"`. `counts: dict` → `Record<Severity, number>`. |
| `ChatTurn` (Pydantic) | `ChatTurn` (TS) | `role: str` → narrowed `"user" \| "assistant"`. Sent as `{messages: ChatTurn[]}` to `/api/chat`. |
| `Message` | *(none — frontend-only)* | UI render model; never crosses the wire. |

**Backend invariants to preserve when reconstructing the API** (from `api/main.py`):
- `counts` is always built as `{"심각": 0, "주의": 0, "누락": 0}` then incremented, so all
  three Korean keys are **always present** (zero when no violations). Frontend code may
  rely on every key existing.
- `verdict` is one of three strings: `PASS`, `FAIL`, `REVIEW`. `REVIEW` = "판독 불가"
  (unreadable — amount not identified); it is NOT a pass.
- `rule_tag` on each violation is computed server-side via `rule_tag(v.rule)`.

⚠️ If any backend model field is added/renamed/retyped, update the mirrored TS type in
the **same change** — drift here silently breaks deserialization at runtime (TS does not
validate JSON shape).

---

## 5. Wire data types (mirror backend)

### 5.1 `Violation`

```ts
export interface Violation {
  severity: Severity;
  rule: string;
  rule_tag: string;
  item: string;
  detail: string;
}
```

One rule-engine finding. Mirrors `ViolationOut`. Consumed by `ReceiptSheet.tsx`
(animated violation cards) and summarized in `page.tsx` (`receiptSummary`).

| Field | Type | Semantics | Consumer |
|-------|------|-----------|----------|
| `severity` | `Severity` | Severity bucket; keys into `SEVERITY_META` for icon/colors. | `ReceiptSheet` card styling; `page.tsx` counts. |
| `rule` | `string` | Rule name / short title of what failed. | `ReceiptSheet`; `receiptSummary` (`${v.rule} ${v.item}`). |
| `rule_tag` | `string` | Machine tag for the rule (from backend `rule_tag()`). | `ReceiptSheet` (rule chip/reference). |
| `item` | `string` | The specific offending line item / value. | `ReceiptSheet`; `receiptSummary`. |
| `detail` | `string` | Human-readable explanation of the violation. | `ReceiptSheet` card body. |

### 5.2 `ReceiptData`

```ts
export interface ReceiptData {
  amount: number | null;
  date: string | null;
  vendor: string;
  category: string;
  payment_method: string;
  evidence_type: string;
  ride_datetime: string;
  origin: string;
  destination: string;
}
```

The OCR'd receipt fields. Mirrors `ReceiptOut`. Note **only `amount` and `date` are
nullable**; all other fields are non-null strings that may be empty `""` (the UI treats
empty string as "missing" and renders an em dash `—`).

| Field | Type | Semantics | Consumer / rendering |
|-------|------|-----------|----------------------|
| `amount` | `number \| null` | Total amount (KRW, integer). `null` when unreadable. | Rendered as `₩${(amount ?? 0).toLocaleString()}` in `page.tsx` receipt chip + `receiptSummary`; metric grid in `ReceiptSheet`. |
| `date` | `string \| null` | Expense date. `null`/empty → `—`. | `receiptSummary` (`c.date \|\| "—"`); `ReceiptSheet`. |
| `vendor` | `string` | Merchant / store name. | `ReceiptSheet` metric grid. |
| `category` | `string` | Business category / 업종. Empty → `—`. | `receiptSummary` (업종); `ReceiptSheet`. |
| `payment_method` | `string` | 결제수단 (card/cash/etc). Empty → `—`. | `page.tsx` chip subtitle; `receiptSummary`; `ReceiptSheet`. |
| `evidence_type` | `string` | 증빙 type. Empty → `—`. | `receiptSummary`; `ReceiptSheet`. |
| `ride_datetime` | `string` | Taxi ride date/time (empty if not a taxi receipt). | Taxi route block in `ReceiptSheet`; `receiptSummary` (conditional). |
| `origin` | `string` | Taxi trip origin. | Taxi route block; `receiptSummary`. |
| `destination` | `string` | Taxi trip destination. | Taxi route block; `receiptSummary`. |

Taxi fields (`ride_datetime`/`origin`/`destination`) are only meaningfully populated for
taxi receipts; `page.tsx` only adds the taxi summary line `if (c.ride_datetime || c.origin)`.

### 5.3 `VerifyResult`

```ts
export interface VerifyResult {
  verdict: "PASS" | "FAIL" | "REVIEW";
  receipt: ReceiptData;
  violations: Violation[];
  counts: Record<Severity, number>;
}
```

The full `/api/verify-receipt` response. Returned by `verifyReceipt()` (see
`03-API-CONTRACT.md`), stored in `page.tsx` as a `receipt` message and in `sheet` state
for the bottom sheet.

| Field | Type | Semantics |
|-------|------|-----------|
| `verdict` | `"PASS" \| "FAIL" \| "REVIEW"` | Overall judgment (see §7). Drives chip color/label and REVIEW re-attach flow. |
| `receipt` | `ReceiptData` | The parsed receipt fields. |
| `violations` | `Violation[]` | All findings (empty array = no violations). |
| `counts` | `Record<Severity, number>` | Per-severity tallies; all three Korean keys always present (may be `0`). Drives FAIL chip breakdown. |

### 5.4 `ChatTurn`

```ts
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
```

One conversation turn. Mirrors backend `ChatTurn`. The frontend keeps a rolling history
in `page.tsx` (`historyRef.current: ChatTurn[]`, capped to last `MAX_HISTORY_TURNS = 20`)
and POSTs `{ messages: ChatTurn[] }` to `/api/chat`. Receipt verification results are
summarized into a `ChatTurn` (via `receiptSummary`) so multi-turn follow-ups remember
the receipt.

| Field | Type | Semantics |
|-------|------|-----------|
| `role` | `"user" \| "assistant"` | Turn author. Maps directly to Anthropic message roles server-side. |
| `content` | `string` | Turn text. For receipt turns, this is the `receiptSummary` block, optionally `+ "\n\n사용자 질문: …"`. |

---

## 6. `Message` — UI render model (discriminated union)

```ts
export type Message =
  | { id: string; kind: "text"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "receipt"; role: "assistant"; result: VerifyResult }
  | { id: string; kind: "image"; role: "user"; url: string; name: string }
  | { id: string; kind: "error"; role: "assistant"; content: string; retry: { text: string; file: File | null } };
```

**Frontend-only** — never sent to or received from the backend. Held in `page.tsx`
`const [messages, setMessages] = useState<Message[]>([])` and rendered by `messages.map`.
The discriminant is **`kind`** (NOT `role`); `page.tsx` switches on `m.kind`. Every
variant carries `id: string` (generated by `uid()` = `crypto.randomUUID()`) used as the
React `key` and to target streaming updates (`m.id === aid`).

| `kind` | Allowed `role` | Payload fields | When created (`page.tsx`) | How rendered |
|--------|----------------|----------------|----------------------------|--------------|
| `"text"` | `"user" \| "assistant"` | `content: string` | User text submit; each assistant stream token (first token creates it, later tokens `map`-update `content`). | `ChatBubble`; assistant text wrapped in `<Markdown>`, user text raw. |
| `"receipt"` | `"assistant"` | `result: VerifyResult` | After `verifyReceipt(file)` resolves. | `ChatBubble` with tappable verdict chip → `setSheet(m.result)` opens `ReceiptSheet`. |
| `"image"` | `"user"` | `url: string; name: string` | When user attaches a file (before verification). `url` is a **data URL** from `fileToDataUrl` (persisted, no revoke needed). `name` = `file.name`. | Right-aligned `<img>` (spring-animated `motion.div`), `max-w-[60%] rounded-4xl shadow-toss`. |
| `"error"` | `"assistant"` | `content: string; retry: { text: string; file: File \| null }` | In the `catch` of `handleSubmit` (non-abort errors). | `ChatBubble` showing `content` + a `다시 시도` button calling `handleSubmit(m.retry.text, m.retry.file, true)`. |

Key behaviors that depend on this shape:
- **Streaming append/update** relies on the `text` variant having a stable `id`: the
  first token does `setMessages((p) => [...p, { id: aid, kind: "text", role: "assistant", content: acc }])`,
  subsequent tokens do `p.map((m) => (m.id === aid && m.kind === "text" ? { ...m, content: acc } : m))`.
  The `m.kind === "text"` narrowing in the predicate is required for TS to allow
  spreading `content`.
- **Image persistence**: `url` MUST be a data URL (not an object URL). `page.tsx`
  comment: object URLs in message state would leak (no revoke point); data URLs need no
  cleanup. (Composer's *preview* chip may use object URLs because it revokes them — see
  `04-COMPONENTS.md`.)
- **Retry**: `retry.file` is `File | null` so a failed text-only or file-bearing submit
  can be replayed without re-attaching; `isRetry=true` prevents re-rendering the user/image
  messages.

---

## 7. Verdict states (consumed in `page.tsx` + `ReceiptSheet`)

`VerifyResult.verdict` drives the receipt chip in `page.tsx` and the verdict banner in
`ReceiptSheet`. Exact mapping from `page.tsx`:

| `verdict` | Chip ink class | Chip label (verbatim) | Meaning |
|-----------|----------------|------------------------|---------|
| `"PASS"` | `text-toss-blue` | `✅ PASS` | Receipt passes all checkable rules. |
| `"REVIEW"` | `text-toss-yellow` | `🔎 검증 불가` | Unreadable (amount not identified); prompts re-attach. |
| `"FAIL"` | `text-toss-red` | `failLabel(counts)` → e.g. `❌ FAIL · 심각 2 · 주의 1` or bare `❌ FAIL` | Has violations; severity breakdown shown. |

`failLabel(counts: Record<Severity, number>)` (in `page.tsx`) iterates
`Object.keys(SEVERITY_META) as Severity[]`, filters `counts?.[s] > 0`, maps to
`` `${SEVERITY_META[s].label} ${counts[s]}` ``, and joins with `" · "`; returns
`` `❌ FAIL · ${parts.join(" · ")}` `` or `"❌ FAIL"` when no positive counts. This is
why `counts` must contain all severity keys and why `SEVERITY_META` key order defines the
display order (심각 → 주의 → 누락).

The receipt chip subtitle (verbatim):
`` `₩${(m.result.receipt.amount ?? 0).toLocaleString()} · ${m.result.receipt.payment_method || "—"} · 탭하여 상세` ``

REVIEW flow: when a file is attached with no accompanying text and `verdict === "REVIEW"`,
`page.tsx` calls the chat with a prompt asking the assistant to politely request a
re-attach (so the guidance appears in chat even if the sheet is closed). See
`02-ARCHITECTURE-AND-STATE.md` and `05-FLOWS-AND-SCREENS.md`.

---

## 8. Reconstruction checklist

- [ ] `Severity` union uses the exact Korean literals `"심각" | "주의" | "누락"`.
- [ ] `SEVERITY_META` is `export const`, typed `Record<Severity, {...}>`, with the exact
      icon/label/dot/bg values in §3 (note `주의 → bg-orange-50`, mixed token vs. stock
      Tailwind classes).
- [ ] `ReceiptData.amount` is `number | null`; `date` is `string | null`; all other
      fields are non-null `string`.
- [ ] `VerifyResult.verdict` is the 3-member string union; `counts` is
      `Record<Severity, number>`.
- [ ] `Message` is a 4-member union discriminated by `kind`; every member has `id: string`.
- [ ] No default export; only `SEVERITY_META` is runtime, the rest are `type`/`interface`.
- [ ] Backend `ViolationOut`/`ReceiptOut`/`VerifyResult`/`ChatTurn` shapes match (§4).
