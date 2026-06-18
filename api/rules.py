"""영수증 결정적 규칙엔진 — 비전이 추출한 필드에 회사 룰(R-01·R-06·R-07·R-08)을 순수 함수로 적용."""

from typing import Optional, List, Dict

SEVERITIES = ["심각", "주의", "누락"]

# 규칙명 → 짧은 태그 (rule_tag)
_TAGS = {
    "야근 택시비 정보 누락": "R-08",
    "야근 택시비 개인카드 사용": "R-08",
    "적격증빙 미비": "R-01",
    "개인카드 사용 사유 미기재": "R-06",
    "식대 한도 초과": "R-07",
}


def rule_tag(rule: str) -> str:
    return _TAGS.get(rule, "R-12")


def classify_payment(raw: str) -> str:
    """결제수단 결정적 분류: '법인' 포함 여부로 판정 ('현대법인카드'도 법인카드)."""
    if not raw:
        return ""
    return "법인카드" if "법인" in raw else ("개인카드" if "카드" in raw else raw)


def is_taxi(category: str, vendor: str) -> bool:
    blob = f"{category} {vendor}"
    return any(k in blob for k in ["택시", "교통", "카카오", "타다", "uber", "Uber", "T 택시"])


def _v(severity: str, rule: str, item: str, detail: str) -> Dict:
    return {"severity": severity, "rule": rule, "rule_tag": rule_tag(rule), "item": item, "detail": detail}


def evaluate(extract: dict) -> dict:
    """추출 dict → VerifyResult dict (verdict/receipt/violations/counts)."""
    amount: Optional[int] = extract.get("amount")
    date: Optional[str] = extract.get("date")
    vendor: str = (extract.get("vendor") or "").strip()
    category: str = (extract.get("category") or "").strip()
    payment_raw: str = (extract.get("payment_method") or "").strip()
    evidence_type: str = (extract.get("evidence_type") or "").strip()
    ride_datetime: str = (extract.get("ride_datetime") or "").strip()
    origin: str = (extract.get("origin") or "").strip()
    destination: str = (extract.get("destination") or "").strip()

    payment_method = classify_payment(payment_raw)

    receipt = {
        "amount": amount,
        "date": date,
        "vendor": vendor,
        "category": category,
        "payment_method": payment_method or payment_raw,
        "evidence_type": evidence_type,
        "ride_datetime": ride_datetime,
        "origin": origin,
        "destination": destination,
    }

    # 금액 판독 불가 → REVIEW (판정 불가)
    if amount is None:
        return {
            "verdict": "REVIEW",
            "receipt": receipt,
            "violations": [],
            "counts": {s: 0 for s in SEVERITIES},
        }

    violations: List[Dict] = []
    taxi = is_taxi(category, vendor)

    # R-08 야근 택시비: 시간·출발지·도착지 모두 명기 필수
    if taxi:
        missing = []
        if not ride_datetime:
            missing.append("이용시간")
        if not origin:
            missing.append("출발지")
        if not destination:
            missing.append("도착지")
        if missing:
            violations.append(
                _v(
                    "누락",
                    "야근 택시비 정보 누락",
                    " · ".join(missing) + " 미기재",
                    "야근 택시비는 이용 시간·출발지·도착지를 모두 명기해야 합니다 (R-08).",
                )
            )
        if payment_method == "개인카드":
            violations.append(
                _v(
                    "주의",
                    "야근 택시비 개인카드 사용",
                    "개인카드 결제",
                    "야근 택시비는 법인카드 결제가 원칙입니다 (R-08). 개인카드 사용 시 사유 기재 필요.",
                )
            )

    # R-01 적격증빙: 3만원 초과인데 간이영수증
    if amount > 30000 and ("간이" in evidence_type):
        violations.append(
            _v(
                "심각",
                "적격증빙 미비",
                f"₩{amount:,} / {evidence_type}",
                "₩30,000 초과 지출은 적격증빙(세금계산서·신용카드 매출전표·현금영수증)이 필요합니다. "
                "간이영수증만이면 증빙불비가산세(2%) 대상입니다 (R-01).",
            )
        )

    # R-06 개인카드 사용 (택시 외 일반 건)
    if not taxi and payment_method == "개인카드":
        violations.append(
            _v(
                "주의",
                "개인카드 사용 사유 미기재",
                "개인카드 결제",
                "원칙은 법인카드입니다. 개인카드 사용 시 불가피한 사유를 결의서에 기재해야 합니다 (R-06).",
            )
        )

    counts = {s: 0 for s in SEVERITIES}
    for v in violations:
        counts[v["severity"]] = counts.get(v["severity"], 0) + 1

    verdict = "FAIL" if violations else "PASS"
    return {"verdict": verdict, "receipt": receipt, "violations": violations, "counts": counts}
