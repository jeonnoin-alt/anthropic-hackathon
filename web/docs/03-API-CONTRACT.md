# 03 — Frontend ⇄ Backend API Contract

The exact HTTP contract the SpendSentry web frontend depends on. Three endpoints: a **streaming plain-text** chat, a **multipart receipt verifier**, and a **health check**. Backend rule-engine internals (OCR, severity logic) are OUT OF SCOPE here — only the wire shape matters. Reconstruct the client (`web/lib/api.ts`) and the TypeScript types (`web/lib/types.ts`) so they match this document byte-for-byte.

**Source files specified**
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/lib/api.ts` — `verifyReceipt`, `streamChat`, base-URL resolution.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/web/lib/types.ts` — `Severity`, `SEVERITY_META`, `Violation`, `ReceiptData`, `VerifyResult`, `ChatTurn`, `Message`.
- `/Users/jeon-younghoon/Desktop/Git/hackertone/api/main.py` — FastAPI routes, Pydantic response models (the authoritative server-side shape).

Cross-references: data types are consumed by `ReceiptSheet` (see **04-COMPONENTS.md**), the page state machine (**02-ARCHITECTURE-AND-STATE.md**), the per-flow transitions (**05-FLOWS-AND-SCREENS.md**), and all Korean strings (**06-COPY-KO.md**). Tailwind tokens like `bg-toss-red` live in **01-DESIGN-SYSTEM.md**.

---

## 1. Base URL resolution

The client never hard-codes a host. It reads one env var:

```ts
// lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL ?? "";
```

- **Default (`""` = same-origin).** All requests go to relative paths (`/api/verify-receipt`, `/api/chat`, `/api/health`). Next.js `rewrites` in `next.config.js` proxy `/api/:path*` → `BACKEND_URL` (default `http://localhost:8000`). One public URL serves both the app and the API — no CORS in production.
- **Split deploy.** Set `NEXT_PUBLIC_API_URL` (e.g. `https://api.example.com`) at build time; the client then calls `https://api.example.com/api/...` absolutely. (Server-side CORS allows only `http://localhost:3000` / `http://127.0.0.1:3000` in dev, so split deploys outside dev need their own CORS config — backend concern.)
- Build the full URL exactly as `` `${API}/api/<path>` ``. With `API === ""` this yields `"/api/<path>"`.

Endpoint summary:

| Method | Path                   | Request body                        | Response                              | Client fn        |
|--------|------------------------|-------------------------------------|---------------------------------------|------------------|
| POST   | `/api/chat`            | JSON `{ messages: ChatTurn[] }`     | **streaming** `text/plain; charset=utf-8` (raw token chunks) | `streamChat`     |
| POST   | `/api/verify-receipt`  | `multipart/form-data`, field `file` | JSON `VerifyResult`                   | `verifyReceipt`  |
| GET    | `/api/health`          | —                                   | JSON `{ ok, model, key_set }`         | (not wrapped)    |

---

## 2. POST `/api/chat` — streaming plain-text chat

### Request

- Headers: `Content-Type: application/json`.
- Body: `{ "messages": ChatTurn[] }` where `ChatTurn = { role: "user" | "assistant", content: string }`.
- `fetch` is called with an `AbortSignal` so the in-flight stream can be cancelled.

```jsonc
// request body
{
  "messages": [
    { "role": "user", "content": "식대 한도가 얼마예요?" },
    { "role": "assistant", "content": "1인 식대 한도는 ..." },
    { "role": "user", "content": "그럼 주말 식대는요?" }
  ]
}
```

### Response — NOT SSE, NOT JSON

The server returns `StreamingResponse(..., media_type="text/plain; charset=utf-8")`. The body is a sequence of **raw UTF-8 token chunks** emitted straight from the Anthropic `text_stream` — there are **no `data:` prefixes, no event framing, no JSON envelope, no trailing terminator**. Each network chunk is just more text to append. Concatenating every chunk in order yields the complete assistant message.

### Exact client read loop (must replicate)

```ts
export async function streamChat(
  messages: ChatTurn[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`chat: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onToken(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
```

Behavior rules the reconstruction MUST honor:

- **Reader + streaming decoder.** Read `res.body.getReader()`; decode each `value` with a single long-lived `TextDecoder` using `{ stream: true }` so multi-byte UTF-8 (Korean) split across chunk boundaries is reassembled correctly. Do not create a new decoder per chunk and do not use `res.text()` (that would block until the whole stream finishes, killing the typing effect).
- **`onToken` per chunk.** Each decoded chunk is forwarded immediately via the `onToken(t)` callback. The chunk is a partial string fragment, NOT a token count or JSON — append it verbatim.
- **Accumulate into one bubble.** The caller (`page.tsx`) holds the streaming assistant message and appends every `onToken` fragment to its `content`, so the UI fills one assistant `ChatBubble` progressively (`TypingDots` shows until the first token arrives, then is replaced/accompanied by the growing text). See **02-ARCHITECTURE-AND-STATE.md** for the exact state update.
- **Cancellation.** Pass an `AbortController.signal`. Aborting (new send / unmount / stop button) rejects the `fetch`/`reader.read()` with an `AbortError`. The `finally` block always calls `reader.cancel()` to release the lock; the `.catch(() => {})` swallows the post-abort cancel error. The caller distinguishes a deliberate abort from a real failure and does NOT render an error bubble for an abort.
- **Return type `Promise<void>`** — the function streams via callback and resolves when the stream ends; it returns no value.

---

## 3. POST `/api/verify-receipt` — multipart receipt verification

### Request

- Body: `multipart/form-data` with a single field **`file`** (the image). No JSON, no other fields.
- Accepted image types: **`image/png`** and **`image/jpeg`** only (enforced client-side by the Composer file input `accept="image/png,image/jpeg"`).
- Server media decision: `media = "image/png" if content_type.endswith("png") else "image/jpeg"` — anything not ending in `png` is treated as JPEG.

```ts
export async function verifyReceipt(file: File): Promise<VerifyResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/api/verify-receipt`, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`verify-receipt: ${body?.detail ?? res.status}`);
  }
  return res.json();
}
```

> Do NOT set `Content-Type` manually for the multipart request — let the browser set the boundary. The client appends only `fd.append("file", file)`.

### Response — `VerifyResult` (JSON)

Authoritative TypeScript shape (`lib/types.ts`), mirroring the Pydantic models in `api/main.py`:

```ts
export type Severity = "심각" | "주의" | "누락";

export interface Violation {
  severity: Severity;   // one of the three Korean severities
  rule: string;         // human-readable rule name
  rule_tag: string;     // short code/tag from rule_tag(rule)
  item: string;         // the offending field/line
  detail: string;       // explanation shown to the user
}

export interface ReceiptData {           // server: ReceiptOut
  amount: number | null;                 // server amount: Optional[int] — null = unreadable
  date: string | null;                   // server date: Optional[str]
  vendor: string;
  category: string;
  payment_method: string;
  evidence_type: string;
  ride_datetime: string;                 // taxi/transport only; "" otherwise
  origin: string;                        // taxi route start; "" otherwise
  destination: string;                   // taxi route end; "" otherwise
}

export interface VerifyResult {
  verdict: "PASS" | "FAIL" | "REVIEW";
  receipt: ReceiptData;
  violations: Violation[];
  counts: Record<Severity, number>;      // always carries all 3 keys
}
```

#### Field-by-field contract

**`verdict`** — string enum, exactly one of:

| Value     | Meaning                                                                 | UI verdict (see ReceiptSheet) |
|-----------|-------------------------------------------------------------------------|-------------------------------|
| `PASS`    | Passes all checkable rules.                                             | blue `✅`                      |
| `FAIL`    | One or more violations.                                                 | red `❌` + severity breakdown  |
| `REVIEW`  | **Unreadable receipt** — `amount` could not be identified. **Judging impossible.** | yellow `🔎` "판독 불가", prompts re-attach |

> **CRITICAL:** `REVIEW` is **not** a pass. It means the image could not be read (`amount` is `null`). It MUST NOT be rendered or counted as `PASS`. The UI shows the yellow 🔎 "판독 불가" state and asks the user to re-attach a clearer image. The server comment is explicit: `"REVIEW"(판독 불가)`.

**`receipt`** (`ReceiptOut`) — `amount` and `date` are nullable (`Optional[int]` / `Optional[str]`). `amount === null` is the signal that drives `REVIEW`. The transport-only fields `ride_datetime` / `origin` / `destination` are **always present strings** (empty `""` when the receipt is not a taxi/transport receipt) — they are NOT nullable. `ReceiptSheet` renders the taxi route only when `origin` and `destination` are non-empty.

**`violations`** — array of `Violation`. Empty `[]` for `PASS` and `REVIEW`. Each entry's `severity` is Korean-keyed; `SEVERITY_META[severity]` (below) is the single source of truth for its icon/label/colors. `rule_tag` is a short tag derived server-side via `rule_tag(v.rule)`.

**`counts`** — `Record<Severity, number>`. The server always seeds all three keys, so the object always contains `"심각"`, `"주의"`, `"누락"` (any unused severity is `0`):

```python
counts = {"심각": 0, "주의": 0, "누락": 0}
for v in violations:
    counts[v.severity] = counts.get(v.severity, 0) + 1
```

`page.tsx` uses `counts` to render the FAIL severity chip counts in the chat list; `ReceiptSheet` uses both `violations` and `counts`.

#### `SEVERITY_META` — single source of truth (verbatim)

```ts
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red",    bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue",   bg: "bg-blue-50" },
};
```

Both `page.tsx` (FAIL chip counts) and `ReceiptSheet` (violation cards keyed by severity) read from this map. Do not hard-code severity colors/icons anywhere else.

### Example responses

**(a) FAIL — multiple violations**

```json
{
  "verdict": "FAIL",
  "receipt": {
    "amount": 320000,
    "date": "2026-06-14",
    "vendor": "한우마을 강남점",
    "category": "접대비",
    "payment_method": "법인카드",
    "evidence_type": "카드전표",
    "ride_datetime": "",
    "origin": "",
    "destination": ""
  },
  "violations": [
    {
      "severity": "심각",
      "rule": "접대비 1인 한도 초과",
      "rule_tag": "ENT-LIMIT",
      "item": "320,000원 / 2인",
      "detail": "접대비 1인 한도(50,000원)를 초과했습니다. 초과분은 사적 비용으로 처리될 수 있습니다."
    },
    {
      "severity": "주의",
      "rule": "주말 접대 사용",
      "rule_tag": "ENT-WEEKEND",
      "item": "2026-06-14 (일)",
      "detail": "주말 접대비는 사유서가 필요합니다."
    },
    {
      "severity": "누락",
      "rule": "참석자 명단 미기재",
      "rule_tag": "ENT-ATTENDEE",
      "item": "참석자",
      "detail": "접대비는 참석자 명단(소속·인원)을 함께 제출해야 합니다."
    }
  ],
  "counts": { "심각": 1, "주의": 1, "누락": 1 }
}
```

**(b) PASS — no violations**

```json
{
  "verdict": "PASS",
  "receipt": {
    "amount": 8500,
    "date": "2026-06-16",
    "vendor": "김밥천국 역삼점",
    "category": "식대",
    "payment_method": "법인카드",
    "evidence_type": "카드전표",
    "ride_datetime": "",
    "origin": "",
    "destination": ""
  },
  "violations": [],
  "counts": { "심각": 0, "주의": 0, "누락": 0 }
}
```

**(c) REVIEW — unreadable (amount not found)**

```json
{
  "verdict": "REVIEW",
  "receipt": {
    "amount": null,
    "date": null,
    "vendor": "",
    "category": "",
    "payment_method": "",
    "evidence_type": "",
    "ride_datetime": "",
    "origin": "",
    "destination": ""
  },
  "violations": [],
  "counts": { "심각": 0, "주의": 0, "누락": 0 }
}
```

**(d) Taxi/transport receipt (route fields populated)** — illustrates `ride_datetime` / `origin` / `destination` usage:

```json
{
  "verdict": "PASS",
  "receipt": {
    "amount": 14300,
    "date": "2026-06-15",
    "vendor": "카카오택시",
    "category": "교통비",
    "payment_method": "법인카드",
    "evidence_type": "앱영수증",
    "ride_datetime": "2026-06-15 21:40",
    "origin": "강남역",
    "destination": "판교역"
  },
  "violations": [],
  "counts": { "심각": 0, "주의": 0, "누락": 0 }
}
```

> Field VALUES above (vendor names, rule text, tags, amounts) are illustrative examples of the *shape*; the live rule-engine produces its own strings. The KEYS, types, nullability, `verdict` enum, and `counts` always-3-keys invariant are the binding contract.

---

## 4. GET `/api/health`

Liveness + API-key check. No client wrapper in `lib/api.ts`; callable directly.

```json
{ "ok": true, "model": "claude-haiku-4-5", "key_set": true }
```

| Field      | Type    | Meaning                                                        |
|------------|---------|----------------------------------------------------------------|
| `ok`       | boolean | Always `true` when the server is up.                           |
| `model`    | string  | Backend chat model id — currently `"claude-haiku-4-5"`.        |
| `key_set`  | boolean | `true` iff `ANTHROPIC_API_KEY` is present in the server env.   |

If `key_set` is `false`, chat will fail server-side (no API key) — useful for a setup/health diagnostic.

---

## 5. Error handling → the three Korean error bubbles

Both client functions throw `Error` with a prefixed message; the caller catches and maps to a `kind: "error"` `Message` carrying a `retry` payload. The error `Message` union member:

```ts
| { id: string; kind: "error"; role: "assistant"; content: string; retry: { text: string; file: File | null } }
```

### Thrown-error contract

| Source                 | Condition                                  | Thrown message                                  |
|------------------------|--------------------------------------------|-------------------------------------------------|
| `verifyReceipt`        | `!res.ok`                                  | `verify-receipt: <FastAPI detail or status>`    |
| `streamChat`           | `!res.ok` **or** missing `res.body`        | `chat: <status>`                                |
| `streamChat` (cancel)  | `AbortError` after `signal.abort()`        | (rejects with `AbortError` — **NOT** an error bubble) |

- **verify-receipt errors** parse the FastAPI error envelope `{ "detail": "..." }` (e.g. on a 4xx/5xx). The client does `await res.json().catch(() => null)` then throws `` `verify-receipt: ${body?.detail ?? res.status}` `` — so the user-facing reason is the server's `detail` when present, otherwise the numeric status.
- **chat errors** do not parse a body; they throw `` `chat: ${res.status}` `` (covers non-OK status AND a null/absent streaming body).
- **Abort is not an error.** When the caller aborts via the stop button / new send / unmount, the rejection is an `AbortError`. The caller must check `signal.aborted` / `err.name === "AbortError"` and skip the error bubble (the partially streamed assistant bubble simply stops growing).

### Mapping to the three Korean error bubbles

The page maps a caught (non-abort) error to one of three error bubbles (exact Korean strings live in **06-COPY-KO.md** — keep verbatim, do not translate or re-punctuate). Conceptually:

1. **Receipt verify failure** (`verify-receipt: ...` thrown) → an error bubble explaining the receipt could not be verified, with **다시 시도** (retry) re-running `verifyReceipt` on the same `retry.file`.
2. **Chat failure** (`chat: <status>` thrown, non-abort) → an error bubble explaining the answer could not be generated, with **다시 시도** re-running `streamChat` on `retry.text`.
3. **REVIEW is NOT an error bubble** — it is a successful `VerifyResult` rendered by `ReceiptSheet` in the yellow 🔎 "판독 불가" state, prompting the user to attach a clearer image. Do not route `REVIEW` through the error path.

Each error bubble's `retry` carries `{ text, file }`: `text` for re-sending a chat turn, `file` for re-verifying a receipt. Tapping retry removes the error bubble and re-invokes the matching API call with the saved payload. See **02-ARCHITECTURE-AND-STATE.md** for the full send/verify/retry state machine (and **05-FLOWS-AND-SCREENS.md** for the per-flow transitions).

---

## 6. Invariants checklist (for the reconstruction)

- [ ] `const API = process.env.NEXT_PUBLIC_API_URL ?? ""` — default same-origin; build paths as `` `${API}/api/<path>` ``.
- [ ] `/api/chat` is consumed via `getReader()` + a single `TextDecoder` with `{ stream: true }`; chunks appended verbatim to one assistant bubble. Never `res.text()`.
- [ ] `streamChat` accepts and forwards an `AbortSignal`; `finally` calls `reader.cancel().catch(() => {})`; aborts do NOT produce error bubbles.
- [ ] `verifyReceipt` posts `FormData` with field name exactly `file`; never sets `Content-Type` manually.
- [ ] `verify-receipt` errors → `verify-receipt: <detail ?? status>`; `chat` errors → `chat: <status>`.
- [ ] `verdict` is `"PASS" | "FAIL" | "REVIEW"`; `REVIEW` (amount === null) is unreadable, never shown as PASS.
- [ ] `counts` always has all three keys `심각`/`주의`/`누락` (zero-filled); `SEVERITY_META` is the only place severity colors/icons are defined.
- [ ] `receipt.amount` / `receipt.date` are nullable; `ride_datetime`/`origin`/`destination` are always strings (`""` when absent).
