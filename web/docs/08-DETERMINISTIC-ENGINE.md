# 08 — Deterministic Engine (rule routing, R-01~R-12, image downscale)

The backend's deterministic core. Where the frontend docs (00–07) specify the **UI**, this one
specifies the **decision logic** behind `/api/chat` and `/api/verify-receipt`: how a request is
routed, how every policy rule (R-01~R-12) is judged in pure code, and how receipt images are
prepared for fast vision extraction.

This document specifies **structure, signatures, schemas, and logic** — not verbatim source.
It is enough to re-implement the engine identically without copying any original code body.

**Design principle (load-bearing).** The LLM only **extracts and converses**; all **judgment —
amounts, dates, thresholds, verdicts — is pure Python**. Same input ⇒ same verdict.

### Source files specified
- `graph/rules.py` — `POLICY` constants, `Violation`, the `check_*` rule functions,
  `STANDARD_QUESTIONS`, `evaluate_report`, `approval_route`, `quote_requirement`.
- `graph/spendsentry_graph.py` — LangGraph `StateGraph`: `classify` router + `standard` / `report`
  / `scope` / `llm` nodes, and the `run()` entrypoint.
- `graph/receipt.py` — receipt vision extraction (`extract_receipt_image`), the `ReceiptExtract`
  schema, deterministic `cross_check` / `check_overtime_taxi_receipt`, `classify_payment`,
  and `_prepare_image` (downscale).
- `graph/__init__.py` — package marker.

### Related docs (do not duplicate)
- **`03-API-CONTRACT.md`** — the wire shapes this engine produces: `VerifyResult`, `Violation`,
  `ReceiptData`, and the streaming `/api/chat` contract.
- **`07-TYPES.md`** — the TypeScript mirror of those shapes (`Severity`, `SEVERITY_META`, …).
- **`00-OVERVIEW.md`** — dependency versions and env vars.
- **`02-ARCHITECTURE-AND-STATE.md`** — how the frontend consumes the verdicts.

---

## 1. The three optimizations

| # | Optimization | What it guarantees | Where |
|---|--------------|--------------------|-------|
| ① | **Deterministic rule routing (LangGraph)** | Standardized questions hit fixed rules, not the LLM → identical answer every time | `spendsentry_graph.py` (`classify` → nodes) |
| ② | **Full deterministic rule engine R-01~R-12** | Limits, dates, evidence, entertainment, travel, split-orders all decided in pure functions | `rules.py` (`check_*`, `evaluate_report`) |
| ③ | **Image downscaling for speed** | Phone screenshots shrunk to long-edge ≤1568px before vision → ~3 s reads | `receipt.py` (`_prepare_image`) |

---

## 2. ① Deterministic rule routing (LangGraph)

A `StateGraph` over a small typed state. The entry node `classify` is a **pure function** —
no LLM — that assigns one of four routes; conditional edges fan out to a node per route; each
node returns `answer`.

```
START → classify ─┬─ "report"   → report_node    (LLM extract → evaluate_report ②)
                  ├─ "standard" → standard_node  (fixed rule answer, NO LLM)
                  ├─ "scope"    → scope_node      (fixed refusal, NO LLM)
                  └─ "llm"      → llm_node        (free-form only, LLM)
                → END
```

### 2.1 `classify` priority (deterministic)

Evaluated top-to-bottom; first match wins:

1. **`report`** — input looks like a full expense report: contains a marker
   (`지출결의서` / `제출자` / `품의` / `결의서`) **or** ≥ 2 currency amounts.
2. **`standard`** — `match_standard_question(text)` returns a hit (keyword AND-match).
3. **`scope`** — text contains a blocklist term (e.g. `날씨`, `코딩`, `주식`, `번역`, `레시피`).
4. **`llm`** — everything else.

> Report detection is checked **before** standardized questions, so a report that merely mentions
> "점심" is fully evaluated rather than answered as the lunch-limit FAQ.

### 2.2 Standardized question registry

`STANDARD_QUESTIONS: list[StandardQuestion]`, where `StandardQuestion(qid, keywords, answer)` and
`matches(text)` is `all(k in text for k in keywords)`. The answer is built from `POLICY`, so it is
constant for a given policy.

| qid | keywords (AND) | Answer references |
|-----|----------------|-------------------|
| `Q_LUNCH` | `점심` | R-07 lunch limit |
| `Q_DINNER` | `저녁` | R-07 dinner limit |
| `Q_OVERTIME_MEAL` | `야근`, `식대` | R-07 overtime meal + log |
| `Q_OVERTIME_TAXI` | `야근`, `택시` | R-08 required fields |
| `Q_RECEIPT` | `적격증빙` | R-01 threshold + penalty |
| `Q_OFFICIAL_GIFT` | `공직자`, `선물` | R-03 gift limits |
| `Q_OFFICIAL_MEAL` | `공직자`, `식사` | R-03 meal limit |
| `Q_APPROVAL_LINE` | `결재선` | approval delegation |
| `Q_QUOTE` | `견적` | R-11 tiers |

`match_standard_question(text) -> (qid, answer) | None`. **No LLM**; identical text ⇒ identical answer.

### 2.3 Nodes & entrypoint

- `standard_node` / `scope_node` — return a fixed string; never call the model.
- `report_node` — extracts a structured report (LLM, `temperature=0`) then calls `evaluate_report`
  (§3); the **verdict is deterministic** given the extraction.
- `llm_node` — only free-form text reaches the model.
- `run(text, api_key=None) -> {"route", "answer", "matched_qid"}` — convenience wrapper used by the
  chatbot/API. Routing of policy questions and reports is deterministic; only `llm`/`report`
  extraction needs `api_key`.

---

## 3. ② Full deterministic rule engine (R-01~R-12)

### 3.1 `POLICY` — single source of truth

| Key | Value | Rule |
|-----|-------|------|
| `receipt_threshold` | 30,000 | R-01 |
| `receipt_penalty_rate` | 0.02 | R-01 |
| `entertainment_receipt_threshold` | 30,000 | R-02 |
| `condolence_receipt_threshold` | 200,000 | R-02 |
| `official_meal` / `official_gift` | 30,000 / 50,000 | R-03 |
| `official_agri_gift` / `…_holiday` | 150,000 / 300,000 | R-03 |
| `official_condolence` / `official_wreath` | 50,000 / 100,000 | R-03 |
| `tax_free_meal_monthly` / `tax_free_driving_monthly` | 200,000 / 200,000 | R-04 |
| `meal_lunch` / `meal_dinner` / `meal_overtime` | 13,000 / 18,000 / 15,000 | R-07 |
| `overtime_taxi_start_hour` / `overtime_taxi_overnight_until` | 23 / 5 | R-08 |
| `company_location_keywords` | configurable list | R-08 |
| `quote_single_max` / `quote_competitive_max` | 1,000,000 / 20,000,000 | R-11 |
| `approval_delegated_max` / `team_lead` | 3,000,000 / 이지수 팀장 | approval line |

`LEGAL_RULES = {R-01, R-02, R-03, R-04}`; `rule_tag(code)` returns `⚖️ 세법 고정` for those,
`🏢 회사 내규` otherwise.

### 3.2 `Violation`

A small record: `severity ∈ {심각, 주의, 누락}`, `rule` (e.g. `"R-07"`), `item`, `detail`.
`render()` produces the icon + tagged text. This is the backend mirror of the frontend `Violation`
type (see **07-TYPES.md**); `severity` maps to `SEVERITY_META` colors there.

### 3.3 Per-rule functions (signatures + logic)

Each returns a `Violation` (or `None`); `check_split_orders` returns a list.

| Rule | Function | Inputs | Triggers when | Severity |
|------|----------|--------|---------------|----------|
| R-01 | `check_receipt(amount, evidence_type)` | amount, `qualified\|simple\|none` | amount > 30,000 and not `qualified` | 심각 |
| R-02 | `check_entertainment_receipt(amount, evidence_type, is_condolence=False)` | + condolence flag | over 30,000 (entertainment) / 200,000 (condolence) and not qualified → 손금불산입 | 심각 |
| R-03 | `check_public_official_gift(category, amount, is_holiday=False)` | `meal\|gift\|agri_gift\|condolence\|wreath` | amount > category limit | 심각 |
| R-04 | `check_tax_free_meal(monthly_total)` | month-summed meal amount | monthly_total > 200,000 | 주의 |
| R-05 | `check_approval_date(approval, spend)` | two dates (or `None`) | missing date → 누락; approval > spend → 심각 | 심각/누락 |
| R-06 | `check_payment_method(method, exception_reason="")` | 법인/개인/현금 + reason | 개인카드/현금 with no reason | 주의 |
| R-07 | `check_meal(kind, amount, headcount=1)` | `lunch\|dinner\|overtime` | amount > per-person limit × headcount | 심각 |
| R-08 | `check_overtime_taxi(has_time, has_origin, has_dest, has_receipt)` | four booleans | any required field missing | 누락 |
| R-09 | `check_travel_preapproval(has_travel_request)` | boolean | request not submitted in advance | 심각 |
| R-10 | `check_entertainment_fields(has_company, has_title, has_name)` | three booleans | counterparty company/title/name missing | 누락 |
| R-11 | `quote_requirement(amount)` → `str` | amount | informational tier string | — |
| R-12 | `check_split_orders(items)` → `list` | purchase items | same supplier+date, each < 1,000,000 but sum ≥ 1,000,000 | 심각 |

Also `approval_route(total_amount) -> str` — delegated (≤ 3,000,000) vs CEO escalation.

### 3.4 `evaluate_report(report: dict) -> list[Violation]`

The orchestrator. Input is a **structured** report (the LLM extractor or a test fixture produces it):

```
report = {
  "approval_date": "YYYY-MM-DD" | null,
  "spend_date":    "YYYY-MM-DD" | null,
  "items": [ <item>, … ]
}
```

Item shapes by `type`:

| `type` | Key fields | Rules applied |
|--------|-----------|---------------|
| `meal` | `kind`, `amount`, `headcount` | R-07 (+ contributes to R-04 monthly total) |
| `overtime_taxi` | `has_time/origin/dest/receipt` | R-08 |
| `entertainment` | `amount`, `evidence`, `is_condolence`, `has_company/title/name`, `official_category` | R-02, R-10, R-03 |
| `travel` | `has_travel_request` | R-09 |
| `purchase` | `supplier`, `date`, `amount` | R-12 (cross-item) |
| *(any)* | `evidence`, `payment`, `official_category` | R-01, R-06, R-03 |

Processing order: report-level `check_approval_date` (R-05) → per-item rules → `check_tax_free_meal`
on the summed meal total (R-04) → `check_split_orders` across items (R-12). Output is the ordered
list of `Violation`. **Verdict** = `PASS` if empty, else `FAIL`.

---

## 4. ③ Image downscaling

`_prepare_image(image_bytes, media_type, max_edge=1568) -> (bytes, media_type)`:

- If `max(width, height) ≤ 1568`, return the original untouched.
- Otherwise scale the long edge to 1568 px and re-encode as JPEG (quality 85).
- Pillow missing/failure ⇒ fall back to the original bytes (never throws).

`extract_receipt_image(image_bytes, media_type, api_key, retries=1)` calls `_prepare_image`
**before** base64-encoding, cutting upload size and vision tokens so large phone screenshots verify
in ~3 s. (Note: the project deliberately uses `messages.create` + `ReceiptExtract` Pydantic
validation + one retry, **not** server-side constrained decoding, which timed out on this schema.)

---

## 5. Receipt extraction & cross-check (shapes)

- `ReceiptExtract` (Pydantic) — flat schema; `category` and `evidence_type` are `Literal` enums;
  other fields are scalars/lists (`amount`, `date`, `vendor`, `payment_raw`, `items`,
  `has_alcohol`, `has_personal_item`, `ride_datetime`, `origin`, `destination`). Flat by design to
  avoid grammar-compilation cost on nested line items.
- `classify_payment(raw) -> 법인카드 | 개인카드 | 현금 | ""` — deterministic: `'법인'` in the raw
  string ⇒ 법인카드 (so `현대법인카드` is never misread as personal).
- `cross_check(claim, receipt, company_keywords=None) -> list[Violation]` — amount mismatch (R-01),
  date mismatch (R-05), category mismatch (R-07), non-qualified over threshold (R-01),
  alcohol/personal items (R-10/R-06), and taxi via `check_overtime_taxi_receipt`.
- `check_overtime_taxi_receipt(receipt, company_keywords=None)` — origin/destination present,
  departure hour ≥ 23 (through 05:00), company location present (only if keywords configured),
  corporate-card payment. `company_keywords` comes from `COMPANY_LOCATION_KEYWORDS`; empty ⇒ skip
  the location check (no false positive).

`ReceiptData` (the cross-check input/output record) mirrors the frontend `ReceiptData` in
**07-TYPES.md** and the `VerifyResult.receipt` shape in **03-API-CONTRACT.md**.

---

## 6. Verification checklist

Create the four `graph/` files, then from the parent folder:

```bash
# ① routing (no LLM → always identical)
python -c "from graph.spendsentry_graph import classify; print(classify({'input':'점심 식대 한도'})['route'])"   # standard
python -c "from graph.spendsentry_graph import classify; print(classify({'input':'오늘 날씨'})['route'])"        # scope

# ② rule engine R-01~R-12
python -c "from graph.rules import evaluate_report; \
r={'approval_date':None,'spend_date':'2026-06-10','items':[{'type':'meal','kind':'overtime','amount':100000,'headcount':5,'payment':'개인카드','evidence':'simple'}]}; \
print(sorted({v.rule for v in evaluate_report(r)}))"   # ['R-01','R-05','R-06','R-07']

python -c "from graph.rules import evaluate_report; \
r={'items':[{'type':'entertainment','amount':240000,'evidence':'simple','has_company':False,'has_title':False,'has_name':False,'official_category':'meal'},{'type':'travel','amount':150000,'has_travel_request':False},{'type':'purchase','supplier':'A','date':'d','amount':600000},{'type':'purchase','supplier':'A','date':'d','amount':600000}]}; \
print(sorted({v.rule for v in evaluate_report(r)}))"   # ['R-02','R-03','R-09','R-10','R-12']

# ③ downscale present
python -c "from graph.receipt import _prepare_image; print('downscale OK')"

# payment classification
python -c "from graph.receipt import classify_payment; print(classify_payment('카카오페이 현대법인카드 5531'))"  # 법인카드
```

---

## 7. Dependencies & wiring

```bash
pip install anthropic langgraph langchain-anthropic pydantic Pillow
export ANTHROPIC_API_KEY=sk-ant-...
export COMPANY_LOCATION_KEYWORDS="신논현,본사"   # optional, R-08 company location
```

To make the chatbot deterministic, route chat through `run(text, api_key)` instead of calling the
model directly: policy questions resolve to fixed answers, reports go through `evaluate_report`,
and only free-form text reaches the LLM. The verdict/`Violation` list it returns matches the
`/api/verify-receipt` `VerifyResult` shape in **03-API-CONTRACT.md**.

> **Doc map.** **00**=Overview · **01**=Design System · **02**=Architecture & State · **03**=API
> Contract · **04**=Components · **05**=Flows & Screens · **06**=Copy (KO) · **07**=Types ·
> **08**=Deterministic Engine.
