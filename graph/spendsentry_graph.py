"""① Deterministic rule routing (LangGraph).

A StateGraph over a tiny typed state. The entry node ``classify`` is a PURE
function (no LLM) that assigns one of four routes; conditional edges fan out to
one node per route; each node returns ``answer``.

    START → classify ─┬─ "report"   → report_node   (LLM extract → evaluate_report ②)
                      ├─ "standard" → standard_node (fixed rule answer, NO LLM)
                      ├─ "scope"    → scope_node     (fixed refusal, NO LLM)
                      └─ "llm"      → llm_node        (free-form only, LLM)
                    → END

See web/docs/08-DETERMINISTIC-ENGINE.md §2.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from .rules import (
    POLICY,
    Violation,
    evaluate_report,
    looks_like_report,
    match_standard_question,
    report_verdict,
    rule_tag,
)

# 범위 밖(지출·경비·세무 무관) 차단 키워드
SCOPE_BLOCKLIST = [
    "날씨", "코딩", "주식", "번역", "레시피", "요리", "게임", "영화",
    "운세", "연애", "노래", "축구", "야구", "코인", "비트코인",
]

REFUSAL = (
    "죄송하지만 저는 **지출·경비·세무 컴플라이언스** 관련 질문만 도와드릴 수 있어요. "
    "지출결의서 검토, 식대·접대비·출장비 한도, 적격증빙, 야근 택시비 규정 등을 물어봐 주세요."
)

_SEVERITY_ICON = {"심각": "🔴", "주의": "🟡", "누락": "📋"}


# --------------------------------------------------------------------------- #
# 2.1  classify — deterministic, first match wins                              #
# --------------------------------------------------------------------------- #


def classify(state: Dict) -> Dict:
    """라우트 결정(순수 함수). state['input'] 텍스트로 route/matched_qid 부여.

    우선순위: report → standard → scope → llm.
    """
    text = (state.get("input") or "").strip()
    route = "llm"
    matched_qid: Optional[str] = None

    if looks_like_report(text):
        route = "report"
    else:
        hit = match_standard_question(text)
        if hit:
            route = "standard"
            matched_qid = hit[0]
        elif any(term in text for term in SCOPE_BLOCKLIST):
            route = "scope"

    out = dict(state)
    out["route"] = route
    out["matched_qid"] = matched_qid
    return out


# --------------------------------------------------------------------------- #
# Report extraction + deterministic rendering                                  #
# --------------------------------------------------------------------------- #

_REPORT_EXTRACT_PROMPT = """다음은 직원이 제출한 지출결의서입니다. 판정하지 말고, 아래 JSON 스키마로 사실만 추출하세요. 순수 JSON만 출력(설명·마크다운 금지).
{
  "approval_date": "YYYY-MM-DD" 품의/사전 승인일 또는 null,
  "spend_date": "YYYY-MM-DD" 지출일 또는 null,
  "items": [
    // 식대:     {"type":"meal","kind":"lunch|dinner|overtime","amount":int,"headcount":int,"evidence":"qualified|simple|none","payment":"법인카드|개인카드|현금"}
    // 야근택시: {"type":"overtime_taxi","has_time":bool,"has_origin":bool,"has_dest":bool,"has_receipt":bool,"payment":"..."}
    // 접대:     {"type":"entertainment","amount":int,"evidence":"qualified|simple|none","is_condolence":bool,"has_company":bool,"has_title":bool,"has_name":bool,"official_category":"meal|gift|agri_gift|condolence|wreath"|null}
    // 출장:     {"type":"travel","amount":int,"has_travel_request":bool}
    // 구매:     {"type":"purchase","supplier":str,"date":str,"amount":int}
  ]
}
규칙: evidence는 적격증빙이면 "qualified", 간이영수증이면 "simple", 없으면 "none". 상대방이 공직자가 아니면 official_category는 null. 금액은 정수(원)."""


def _extract_report(text: str, api_key: str, model: str = "claude-haiku-4-5") -> Dict:
    """지출결의서 텍스트 → 구조화 dict (LLM 추출, temperature=0). 판정은 하지 않음."""
    import json

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model,
        max_tokens=900,
        temperature=0,
        messages=[{"role": "user", "content": f"{_REPORT_EXTRACT_PROMPT}\n\n[지출결의서]\n{text}"}],
    )
    raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    s, e = raw.find("{"), raw.rfind("}")
    if s == -1 or e == -1:
        raise ValueError("보고서 추출 JSON 없음")
    return json.loads(raw[s : e + 1])


def render_report(violations: List[Violation]) -> str:
    """위반 목록 → Markdown 판정 보고서(결정적). 표는 코드가 생성."""
    verdict = report_verdict(violations)
    if verdict == "PASS":
        return "## ✅ PASS\n모든 한도·증빙·기재 요건을 충족합니다."

    lines = [f"## ❌ FAIL (위반 {len(violations)}건)", "", "| 심각도 | 규칙 | 내용 |", "|---|---|---|"]
    for v in violations:
        icon = _SEVERITY_ICON.get(v.severity, "•")
        detail = f"{v.item} — {v.detail}".replace("|", "\\|")
        lines.append(f"| {icon} {v.severity} | {v.rule} ({rule_tag(v.rule)}) | {detail} |")
    lines.append("")
    lines.append("> 위 항목을 보완해 다시 제출해 주세요.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Nodes                                                                        #
# --------------------------------------------------------------------------- #


def standard_node(state: Dict) -> Dict:
    """표준 질문 → 고정 규칙 답변 (LLM 미사용)."""
    text = state.get("input") or ""
    hit = match_standard_question(text)
    answer = hit[1] if hit else REFUSAL
    return {"answer": answer}


def scope_node(state: Dict) -> Dict:
    """범위 밖 → 고정 거절 (LLM 미사용)."""
    return {"answer": REFUSAL}


def report_node(state: Dict) -> Dict:
    """지출결의서 → LLM 추출 → evaluate_report → 결정적 판정 보고서."""
    api_key = state.get("api_key") or ""
    if not api_key:
        return {"answer": "_(보고서 추출에는 ANTHROPIC_API_KEY가 필요합니다.)_"}
    structured = _extract_report(state.get("input") or "", api_key)
    violations = evaluate_report(structured)
    return {"answer": render_report(violations), "violations": [v.to_dict() for v in violations]}


def llm_node(state: Dict) -> Dict:
    """자유 형식 질문만 모델로. 정책을 system 프롬프트로 상주."""
    api_key = state.get("api_key") or ""
    if not api_key:
        return {"answer": "_(자유 질문 응답에는 ANTHROPIC_API_KEY가 필요합니다.)_"}

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": state.get("input") or ""}],
    )
    answer = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    return {"answer": answer}


# --------------------------------------------------------------------------- #
# StateGraph assembly                                                          #
# --------------------------------------------------------------------------- #


def build_graph():
    """LangGraph StateGraph 구성 후 compile. langgraph 미설치 시 None."""
    try:
        from langgraph.graph import END, START, StateGraph
    except Exception:  # pragma: no cover
        return None

    g = StateGraph(dict)
    g.add_node("classify", classify)
    g.add_node("standard", standard_node)
    g.add_node("scope", scope_node)
    g.add_node("report", report_node)
    g.add_node("llm", llm_node)

    g.add_edge(START, "classify")
    g.add_conditional_edges(
        "classify",
        lambda s: s["route"],
        {"report": "report", "standard": "standard", "scope": "scope", "llm": "llm"},
    )
    for node in ("standard", "scope", "report", "llm"):
        g.add_edge(node, END)

    return g.compile()


_GRAPH = None


def _graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def run(text: str, api_key: Optional[str] = None) -> Dict:
    """편의 진입점. {'route','answer','matched_qid'} 반환.

    정책 질문/보고서 라우팅은 결정적이며, llm/report 추출만 api_key가 필요하다.
    """
    state = {"input": text or "", "api_key": api_key or ""}
    routed = classify(state)
    route = routed["route"]

    node = {
        "standard": standard_node,
        "scope": scope_node,
        "report": report_node,
        "llm": llm_node,
    }[route]
    result = node(routed)

    return {
        "route": route,
        "answer": result.get("answer", ""),
        "matched_qid": routed.get("matched_qid"),
    }


# --------------------------------------------------------------------------- #
# System prompt for the free-form LLM node                                     #
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = f"""당신은 'Sentri AI', 한국 기업의 **지출결의서 컴플라이언스** 도우미입니다.
직원의 지출·경비·세무 질문을 회사 규정에 따라 간결하고 정확하게 안내합니다.

[핵심 한도 — 결정적 기준]
- 적격증빙(R-01): ₩{POLICY['receipt_threshold']:,} 초과는 세금계산서·신용카드 매출전표·현금영수증 필수, 미비 시 가산세 {int(POLICY['receipt_penalty_rate']*100)}%.
- 청탁금지법(R-03): 공직자 음식물 1인 ₩{POLICY['official_meal']:,}, 선물 ₩{POLICY['official_gift']:,}(농수산물 ₩{POLICY['official_agri_gift']:,}, 명절 ₩{POLICY['official_agri_gift_holiday']:,}).
- 사전 품의(R-05): 사전 승인 원칙, 사후 정산은 원칙적으로 거부(경영지원팀 협의).
- 결제수단(R-06): 법인카드 원칙, 개인카드·현금은 사유 기재 시 예외.
- 식대(R-07): 점심 ₩{POLICY['meal_lunch']:,} / 저녁 ₩{POLICY['meal_dinner']:,} / 야근 ₩{POLICY['meal_overtime']:,}(야근일지 필수).
- 야근 택시비(R-08): 이용시간·출발지·도착지 명기 + 법인카드 원칙.
- 출장(R-09): 출장 신청서 사전 제출 원칙.
- 접대 상대방(R-10): 회사·직위·성명 기재.
- 견적(R-11): ₩{POLICY['quote_single_max']:,} 미만 단일 / ~₩{POLICY['quote_competitive_max']:,} 2개사 / 이상 3개사·대표 승인.

[응답 원칙]
1) 결론(한도 숫자·PASS/FAIL)을 먼저, 관련 R-규칙 번호를 명시한다.
2) 정보가 부족하면 추측하지 말고 되묻는다. 규정에 없는 규칙은 지어내지 않는다.
3) 직전 영수증/결의서에 대한 후속 질문은 보고서를 반복하지 말고 맥락을 참조해 짧게.
4) 한국어 존댓말, 간결하고 실무적으로.
"""
