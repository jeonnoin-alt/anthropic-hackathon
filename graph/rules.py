"""② Full deterministic rule engine (R-01 ~ R-12) + standardized-question registry.

Pure functions only — no LLM, no I/O. Given the same structured input the
verdict is always identical. This module is the single source of truth for the
company policy numbers (`POLICY`) used by both the chatbot answers and the
receipt/report evaluation.

See web/docs/08-DETERMINISTIC-ENGINE.md §3 and §2.2.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

# --------------------------------------------------------------------------- #
# 3.1  POLICY — single source of truth (all amounts in KRW)                   #
# --------------------------------------------------------------------------- #

POLICY: Dict[str, object] = {
    # R-01 적격증빙
    "receipt_threshold": 30_000,
    "receipt_penalty_rate": 0.02,
    # R-02 접대비/경조사비 증빙
    "entertainment_receipt_threshold": 30_000,
    "condolence_receipt_threshold": 200_000,
    # R-03 청탁금지법(공직자)
    "official_meal": 30_000,
    "official_gift": 50_000,
    "official_agri_gift": 150_000,
    "official_agri_gift_holiday": 300_000,
    "official_condolence": 50_000,
    "official_wreath": 100_000,
    # R-04 비과세 한도(월)
    "tax_free_meal_monthly": 200_000,
    "tax_free_driving_monthly": 200_000,
    # R-07 식대 한도(1인 1일)
    "meal_lunch": 13_000,
    "meal_dinner": 18_000,
    "meal_overtime": 15_000,
    # R-08 야근 택시비
    "overtime_taxi_start_hour": 23,
    "overtime_taxi_overnight_until": 5,
    "company_location_keywords": [],  # configurable; empty => skip location check
    # R-11 견적
    "quote_single_max": 1_000_000,
    "quote_competitive_max": 20_000_000,
    # 결재선
    "approval_delegated_max": 3_000_000,
    "team_lead": "이지수 팀장",
}

# 세법 고정 규칙 vs 회사 내규
LEGAL_RULES = {"R-01", "R-02", "R-03", "R-04"}

SEVERITIES = ["심각", "주의", "누락"]


def rule_tag(code: str) -> str:
    """규칙 코드 → 분류 태그. 세법 고정(R-01~R-04)이면 ⚖️, 그 외 회사 내규는 🏢."""
    return "⚖️ 세법 고정" if code in LEGAL_RULES else "🏢 회사 내규"


# --------------------------------------------------------------------------- #
# 3.2  Violation record                                                       #
# --------------------------------------------------------------------------- #

_SEVERITY_ICON = {"심각": "🔴", "주의": "🟡", "누락": "📋"}


@dataclass
class Violation:
    severity: str  # 심각 | 주의 | 누락
    rule: str      # e.g. "R-07"
    item: str
    detail: str

    @property
    def tag(self) -> str:
        return rule_tag(self.rule)

    def render(self) -> str:
        icon = _SEVERITY_ICON.get(self.severity, "•")
        return f"{icon} {self.severity} · {self.rule} · {self.tag} — {self.item}: {self.detail}"

    def to_dict(self) -> Dict[str, str]:
        """프론트 ViolationOut 와이어 형태로 변환 (rule_tag 계산 포함)."""
        return {
            "severity": self.severity,
            "rule": self.rule,
            "rule_tag": self.tag,
            "item": self.item,
            "detail": self.detail,
        }


# --------------------------------------------------------------------------- #
# 3.3  Per-rule functions                                                     #
# --------------------------------------------------------------------------- #


def _qualified(evidence_type: Optional[str]) -> bool:
    """적격증빙 여부: 'qualified' 또는 한국어 적격증빙 키워드."""
    e = (evidence_type or "").strip().lower()
    if e == "qualified":
        return True
    raw = (evidence_type or "")
    return any(k in raw for k in ("세금계산서", "매출전표", "카드전표", "현금영수증", "적격"))


def check_receipt(amount: Optional[int], evidence_type: Optional[str]) -> Optional[Violation]:
    """R-01 적격증빙: 3만원 초과 지출인데 적격증빙이 아니면 심각."""
    if amount is None:
        return None
    if amount > POLICY["receipt_threshold"] and not _qualified(evidence_type):
        rate = int(POLICY["receipt_penalty_rate"] * 100)
        return Violation(
            "심각",
            "R-01",
            f"₩{amount:,} / {evidence_type or '증빙 미상'}",
            f"₩{POLICY['receipt_threshold']:,} 초과 지출은 적격증빙(세금계산서·신용카드 매출전표·현금영수증)이 "
            f"필요합니다. 미비 시 증빙불비가산세({rate}%) 대상입니다.",
        )
    return None


def check_entertainment_receipt(
    amount: Optional[int], evidence_type: Optional[str], is_condolence: bool = False
) -> Optional[Violation]:
    """R-02 접대비/경조사비 증빙: 한도 초과 + 적격증빙 미비 → 손금불산입(심각)."""
    if amount is None:
        return None
    threshold = (
        POLICY["condolence_receipt_threshold"] if is_condolence else POLICY["entertainment_receipt_threshold"]
    )
    if amount > threshold and not _qualified(evidence_type):
        kind = "경조사비" if is_condolence else "접대비"
        return Violation(
            "심각",
            "R-02",
            f"{kind} ₩{amount:,}",
            f"{kind} ₩{threshold:,} 초과는 적격증빙이 없으면 손금불산입(비용 인정 불가) 처리됩니다.",
        )
    return None


def check_public_official_gift(
    category: str, amount: Optional[int], is_holiday: bool = False
) -> Optional[Violation]:
    """R-03 청탁금지법: 공직자 상대 음식물/선물/농수산물/경조사/화환 한도 초과 → 심각."""
    if amount is None:
        return None
    limits = {
        "meal": POLICY["official_meal"],
        "gift": POLICY["official_gift"],
        "agri_gift": POLICY["official_agri_gift_holiday"] if is_holiday else POLICY["official_agri_gift"],
        "condolence": POLICY["official_condolence"],
        "wreath": POLICY["official_wreath"],
    }
    limit = limits.get(category)
    if limit is None:
        return None
    if amount > limit:
        labels = {
            "meal": "음식물",
            "gift": "선물",
            "agri_gift": "농수산물·가공품",
            "condolence": "경조사비",
            "wreath": "화환",
        }
        return Violation(
            "심각",
            "R-03",
            f"공직자 {labels[category]} ₩{amount:,} / 1인 한도 ₩{limit:,}",
            f"청탁금지법상 공직자 {labels[category]} 한도(₩{limit:,})를 초과했습니다. 공직자 여부·인원을 확인하세요.",
        )
    return None


def check_tax_free_meal(monthly_total: Optional[int]) -> Optional[Violation]:
    """R-04 비과세 식대 한도: 월 합계 20만원 초과 → 주의(과세 대상)."""
    if monthly_total is None:
        return None
    if monthly_total > POLICY["tax_free_meal_monthly"]:
        return Violation(
            "주의",
            "R-04",
            f"월 식대 합계 ₩{monthly_total:,}",
            f"비과세 식대 월 한도(₩{POLICY['tax_free_meal_monthly']:,})를 초과한 금액은 과세 대상입니다.",
        )
    return None


def check_approval_date(approval: Optional[str], spend: Optional[str]) -> Optional[Violation]:
    """R-05 사전 품의: 품의 승인일 누락(누락) 또는 승인일이 지출일보다 늦음(심각)."""
    if not approval:
        return Violation(
            "누락",
            "R-05",
            "품의 승인일 없음",
            "사전 품의 승인일이 없어 사전 승인 여부를 확인할 수 없습니다. 사후 정산은 원칙적으로 거부됩니다.",
        )
    if spend and approval > spend:
        return Violation(
            "심각",
            "R-05",
            f"품의 {approval} > 지출 {spend}",
            "품의 승인일이 지출일보다 늦습니다. 사전 승인 원칙 위반입니다.",
        )
    return None


def check_payment_method(method: Optional[str], exception_reason: str = "") -> Optional[Violation]:
    """R-06 결제수단: 개인카드/현금 사용에 사유 미기재 → 주의."""
    m = (method or "").strip()
    is_personal = ("개인" in m) or ("현금" in m) or m.lower() in ("personal", "cash")
    if is_personal and not (exception_reason or "").strip():
        return Violation(
            "주의",
            "R-06",
            f"{m or '개인 결제'} 사용",
            "원칙은 법인카드입니다. 개인카드·현금 사용 시 불가피한 사유를 결의서에 구체적으로 기재해야 합니다.",
        )
    return None


def check_meal(kind: str, amount: Optional[int], headcount: int = 1) -> Optional[Violation]:
    """R-07 식대 한도: 점심/저녁/야근 1인 한도 × 인원 초과 → 심각."""
    if amount is None:
        return None
    key = {"lunch": "meal_lunch", "dinner": "meal_dinner", "overtime": "meal_overtime"}.get(kind)
    if key is None:
        return None
    headcount = max(1, int(headcount or 1))
    limit = POLICY[key] * headcount
    if amount > limit:
        labels = {"lunch": "점심", "dinner": "저녁", "overtime": "야근"}
        over = amount - limit
        return Violation(
            "심각",
            "R-07",
            f"{labels[kind]} 식대 {headcount}인 ₩{amount:,} / 한도 ₩{limit:,}",
            f"{labels[kind]} 식대 한도(1인 ₩{POLICY[key]:,} × {headcount}인 = ₩{limit:,})를 ₩{over:,} 초과했습니다.",
        )
    return None


def check_overtime_taxi(
    has_time: bool, has_origin: bool, has_dest: bool, has_receipt: bool
) -> Optional[Violation]:
    """R-08 야근 택시비: 이용시간·출발지·도착지·영수증 중 하나라도 누락 → 누락."""
    missing = []
    if not has_time:
        missing.append("이용시간")
    if not has_origin:
        missing.append("출발지")
    if not has_dest:
        missing.append("도착지")
    if not has_receipt:
        missing.append("영수증")
    if missing:
        return Violation(
            "누락",
            "R-08",
            " · ".join(missing) + " 미기재",
            "야근 택시비는 이용 시간·출발지·도착지를 모두 명기하고 영수증을 첨부해야 합니다.",
        )
    return None


def check_travel_preapproval(has_travel_request: bool) -> Optional[Violation]:
    """R-09 출장: 출장 신청서 사전 제출 누락 → 심각."""
    if not has_travel_request:
        return Violation(
            "심각",
            "R-09",
            "출장 신청서 사전 미제출",
            "출장 신청서는 사전 제출이 원칙입니다. 사후 제출은 사유서 + 경영지원팀 협의가 필요합니다.",
        )
    return None


def check_entertainment_fields(
    has_company: bool, has_title: bool, has_name: bool
) -> Optional[Violation]:
    """R-10 접대 상대방 기재: 회사·직위·성명 중 하나라도 누락 → 누락."""
    missing = []
    if not has_company:
        missing.append("회사")
    if not has_title:
        missing.append("직위")
    if not has_name:
        missing.append("성명")
    if missing:
        return Violation(
            "누락",
            "R-10",
            "상대방 " + "·".join(missing) + " 미기재",
            "접대비는 상대방 회사·직위·성명을 결의서에 기재해야 합니다.",
        )
    return None


def quote_requirement(amount: Optional[int]) -> str:
    """R-11 견적 수 요건(정보성 문자열)."""
    if amount is None:
        return "금액 미상 — 견적 요건 확인 불가."
    single = POLICY["quote_single_max"]
    comp = POLICY["quote_competitive_max"]
    if amount < single:
        return f"₩{amount:,}: ₩{single:,} 미만 → 단일 견적 가능."
    if amount < comp:
        return f"₩{amount:,}: ₩{single:,}~₩{comp:,} → 2개사 이상 경쟁 견적 필요."
    return f"₩{amount:,}: ₩{comp:,} 이상 → 3개사 이상 또는 대표 승인 필요."


def approval_route(total_amount: Optional[int]) -> str:
    """결재선: 위임 한도 이하면 팀장 전결, 초과면 대표 escalation."""
    delegated = POLICY["approval_delegated_max"]
    if total_amount is not None and total_amount > delegated:
        return f"₩{total_amount:,}: 위임 한도(₩{delegated:,}) 초과 → 대표이사 결재 필요."
    return f"위임 한도(₩{delegated:,}) 이내 → {POLICY['team_lead']} 전결."


def check_split_orders(items: List[Dict]) -> List[Violation]:
    """R-12 분할발주: 동일 공급처+동일 일자에 건당 한도 미만이지만 합계 한도 이상 → 심각."""
    single = POLICY["quote_single_max"]
    groups: Dict[tuple, List[Dict]] = {}
    for it in items:
        if it.get("type") != "purchase":
            continue
        key = (it.get("supplier"), it.get("date"))
        groups.setdefault(key, []).append(it)

    out: List[Violation] = []
    for (supplier, date), group in groups.items():
        if len(group) < 2:
            continue
        amounts = [int(g.get("amount") or 0) for g in group]
        if all(a < single for a in amounts) and sum(amounts) >= single:
            out.append(
                Violation(
                    "심각",
                    "R-12",
                    f"{supplier} {date} {len(group)}건 합계 ₩{sum(amounts):,}",
                    f"동일 공급처·일자에 건당 ₩{single:,} 미만으로 분할 발주했으나 합계가 ₩{single:,} 이상입니다. "
                    "분할발주(쪼개기)로 간주될 수 있습니다.",
                )
            )
    return out


# --------------------------------------------------------------------------- #
# 3.4  evaluate_report — orchestrator                                          #
# --------------------------------------------------------------------------- #


def evaluate_report(report: Dict) -> List[Violation]:
    """구조화된 지출결의서 dict → 위반 목록(결정적)."""
    violations: List[Violation] = []
    items: List[Dict] = report.get("items") or []

    # R-05 (report-level) — 지출일이 있을 때만 품의 승인일 검사
    if report.get("spend_date"):
        v = check_approval_date(report.get("approval_date"), report.get("spend_date"))
        if v:
            violations.append(v)

    meal_total = 0

    for it in items:
        itype = it.get("type")

        if itype == "meal":
            v = check_meal(it.get("kind"), it.get("amount"), it.get("headcount", 1))
            if v:
                violations.append(v)
            meal_total += int(it.get("amount") or 0)

        elif itype == "overtime_taxi":
            v = check_overtime_taxi(
                bool(it.get("has_time")),
                bool(it.get("has_origin")),
                bool(it.get("has_dest")),
                bool(it.get("has_receipt", True)),
            )
            if v:
                violations.append(v)

        elif itype == "entertainment":
            v = check_entertainment_receipt(
                it.get("amount"), it.get("evidence"), bool(it.get("is_condolence"))
            )
            if v:
                violations.append(v)
            v = check_entertainment_fields(
                bool(it.get("has_company")), bool(it.get("has_title")), bool(it.get("has_name"))
            )
            if v:
                violations.append(v)

        elif itype == "travel":
            v = check_travel_preapproval(bool(it.get("has_travel_request")))
            if v:
                violations.append(v)

        # (any) generic checks — R-01 (non-entertainment), R-06, R-03
        if itype != "entertainment" and "evidence" in it:
            v = check_receipt(it.get("amount"), it.get("evidence"))
            if v:
                violations.append(v)
        if "payment" in it:
            v = check_payment_method(it.get("payment"), it.get("exception_reason", ""))
            if v:
                violations.append(v)
        if it.get("official_category"):
            v = check_public_official_gift(
                it.get("official_category"), it.get("amount"), bool(it.get("is_holiday"))
            )
            if v:
                violations.append(v)

    # R-04 — 월 식대 합계
    if meal_total:
        v = check_tax_free_meal(meal_total)
        if v:
            violations.append(v)

    # R-12 — 분할발주(교차 검사)
    violations.extend(check_split_orders(items))

    return violations


def report_verdict(violations: List[Violation]) -> str:
    return "PASS" if not violations else "FAIL"


# --------------------------------------------------------------------------- #
# 2.2  Standardized-question registry                                          #
# --------------------------------------------------------------------------- #


@dataclass
class StandardQuestion:
    qid: str
    keywords: List[str]
    answer: str

    def matches(self, text: str) -> bool:
        return all(k in text for k in self.keywords)


STANDARD_QUESTIONS: List[StandardQuestion] = [
    StandardQuestion(
        "Q_OVERTIME_MEAL",
        ["야근", "식대"],
        f"야근 식대는 **1인 ₩{POLICY['meal_overtime']:,} 이하**입니다 (R-07). "
        "야근 일지 첨부가 필수이며, 저녁 식대와 중복 청구할 수 없습니다.",
    ),
    StandardQuestion(
        "Q_OVERTIME_TAXI",
        ["야근", "택시"],
        "야근 택시비는 **이용 시간·출발지·도착지를 모두 명기**하고 영수증을 첨부해야 합니다 (R-08). "
        "법인카드 결제가 원칙이며, 하나라도 누락되면 위반입니다.",
    ),
    StandardQuestion(
        "Q_LUNCH",
        ["점심"],
        f"점심 식대 한도는 **1인 1일 ₩{POLICY['meal_lunch']:,}**입니다 (R-07).",
    ),
    StandardQuestion(
        "Q_DINNER",
        ["저녁"],
        f"저녁 식대 한도는 **1인 1일 ₩{POLICY['meal_dinner']:,}**입니다 (R-07).",
    ),
    StandardQuestion(
        "Q_RECEIPT",
        ["적격증빙"],
        f"₩{POLICY['receipt_threshold']:,} 초과 지출은 **적격증빙(세금계산서·신용카드 매출전표·현금영수증)**이 "
        f"필수입니다 (R-01). 미비 시 증빙불비가산세 {int(POLICY['receipt_penalty_rate'] * 100)}% 대상입니다.",
    ),
    StandardQuestion(
        "Q_OFFICIAL_GIFT",
        ["공직자", "선물"],
        f"공직자 선물 한도는 일반 **₩{POLICY['official_gift']:,}**, "
        f"농수산물·가공품 **₩{POLICY['official_agri_gift']:,}**"
        f"(명절 ₩{POLICY['official_agri_gift_holiday']:,})입니다 (R-03).",
    ),
    StandardQuestion(
        "Q_OFFICIAL_MEAL",
        ["공직자", "식사"],
        f"공직자 음식물(식사) 한도는 **1인 ₩{POLICY['official_meal']:,}**입니다 (R-03, 청탁금지법).",
    ),
    StandardQuestion(
        "Q_APPROVAL_LINE",
        ["결재선"],
        f"위임 한도(₩{POLICY['approval_delegated_max']:,}) 이내는 {POLICY['team_lead']} 전결, "
        "초과 시 대표이사 결재가 필요합니다.",
    ),
    StandardQuestion(
        "Q_QUOTE",
        ["견적"],
        f"견적은 ₩{POLICY['quote_single_max']:,} 미만 단일 견적, "
        f"₩{POLICY['quote_single_max']:,}~₩{POLICY['quote_competitive_max']:,} 2개사 이상, "
        f"₩{POLICY['quote_competitive_max']:,} 이상 3개사 또는 대표 승인입니다 (R-11).",
    ),
]


def match_standard_question(text: str):
    """표준 질문 매칭(키워드 AND). 히트하면 (qid, answer), 아니면 None. LLM 미사용."""
    for q in STANDARD_QUESTIONS:
        if q.matches(text):
            return q.qid, q.answer
    return None


# --------------------------------------------------------------------------- #
# Helpers shared by the router (report detection)                              #
# --------------------------------------------------------------------------- #

_AMOUNT_RE = re.compile(r"(?:₩\s*\d[\d,]*|\d[\d,]*\s*원)")
_REPORT_MARKERS = ("지출결의서", "제출자", "품의", "결의서")


def looks_like_report(text: str) -> bool:
    """지출결의서로 보이는지: 마커 포함 또는 통화 금액 2개 이상."""
    if any(m in text for m in _REPORT_MARKERS):
        return True
    return len(_AMOUNT_RE.findall(text)) >= 2
