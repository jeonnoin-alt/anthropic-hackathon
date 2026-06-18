"""③ Receipt vision extraction + deterministic cross-check + image downscale.

The vision model only *extracts* raw fields (flat schema, no judgment). Every
verdict — payment classification, threshold checks, taxi field completeness — is
pure Python here, so the same receipt always produces the same result.

See web/docs/08-DETERMINISTIC-ENGINE.md §4–§5.
"""

from __future__ import annotations

import base64
import io
import json
import re
from typing import Dict, List, Optional

from pydantic import BaseModel

try:  # Literal lives in typing on 3.8+
    from typing import Literal
except ImportError:  # pragma: no cover
    from typing_extensions import Literal  # type: ignore

from .rules import (
    POLICY,
    Violation,
    check_payment_method,
    check_receipt,
)

CATEGORY = Literal["식대", "교통비", "접대비", "출장", "경조사비", "소모품", "기타", ""]
EVIDENCE = Literal["카드전표", "세금계산서", "현금영수증", "간이영수증", "앱영수증", "기타", ""]


# --------------------------------------------------------------------------- #
# 5.  ReceiptExtract — flat extraction schema (no nested line items)           #
# --------------------------------------------------------------------------- #


class ReceiptExtract(BaseModel):
    amount: Optional[int] = None
    date: Optional[str] = None
    vendor: str = ""
    category: CATEGORY = ""
    payment_raw: str = ""
    evidence_type: EVIDENCE = ""
    items: List[str] = []
    has_alcohol: bool = False
    has_personal_item: bool = False
    ride_datetime: str = ""
    origin: str = ""
    destination: str = ""


# --------------------------------------------------------------------------- #
# Deterministic payment classification                                         #
# --------------------------------------------------------------------------- #


def classify_payment(raw: str) -> str:
    """결제수단 결정적 분류. '법인' 포함 → 법인카드 ('현대법인카드'도 법인카드).

    우선순위: 법인 > 현금 > 카드(=개인카드). 매칭 없으면 "".
    """
    if not raw:
        return ""
    if "법인" in raw:
        return "법인카드"
    if "현금" in raw:
        return "현금"
    if "카드" in raw or "개인" in raw:
        return "개인카드"
    return ""


def _is_taxi(category: str, vendor: str) -> bool:
    blob = f"{category} {vendor}".lower()
    return any(k in blob for k in ("택시", "교통", "카카오", "타다", "uber", "t 택시"))


def _ride_hour(ride_datetime: str) -> Optional[int]:
    """ride_datetime 문자열에서 출발 '시'(0~23)를 추출. 실패 시 None."""
    m = re.search(r"(\d{1,2}):\d{2}", ride_datetime or "")
    if not m:
        return None
    hour = int(m.group(1))
    return hour if 0 <= hour <= 23 else None


def in_overtime_window(hour: Optional[int]) -> bool:
    """야근 택시 인정 시간대(23:00 ~ 05:00)인지."""
    if hour is None:
        return True  # 시간 불명 → 시간 기준으로는 반려하지 않음
    start = int(POLICY["overtime_taxi_start_hour"])      # 23
    until = int(POLICY["overtime_taxi_overnight_until"])  # 5
    return hour >= start or hour <= until


# --------------------------------------------------------------------------- #
# Deterministic receipt-level checks                                           #
# --------------------------------------------------------------------------- #


def check_overtime_taxi_receipt(
    receipt: Dict, company_keywords: Optional[List[str]] = None
) -> List[Violation]:
    """R-08 야근 택시비 영수증 검증.

    검사: 출발지·도착지·이용시간 존재, (키워드 설정 시) 회사 위치 포함, 법인카드 결제.
    회사 위치 키워드가 비어 있으면 위치 검사는 건너뛴다(오탐 방지).
    """
    company_keywords = company_keywords if company_keywords is not None else POLICY["company_location_keywords"]
    out: List[Violation] = []

    missing = []
    if not (receipt.get("ride_datetime") or "").strip():
        missing.append("이용시간")
    if not (receipt.get("origin") or "").strip():
        missing.append("출발지")
    if not (receipt.get("destination") or "").strip():
        missing.append("도착지")
    if missing:
        out.append(
            Violation(
                "누락",
                "R-08",
                " · ".join(missing) + " 미기재",
                "야근 택시비는 이용 시간·출발지·도착지를 모두 명기해야 합니다.",
            )
        )

    payment = receipt.get("payment_method") or ""
    if payment and payment != "법인카드":
        out.append(
            Violation(
                "주의",
                "R-08",
                f"{payment} 결제",
                "야근 택시비는 법인카드 결제가 원칙입니다. 개인 결제 시 사유 기재가 필요합니다.",
            )
        )

    if company_keywords:
        route = f"{receipt.get('origin', '')} {receipt.get('destination', '')}"
        if not any(k in route for k in company_keywords):
            out.append(
                Violation(
                    "주의",
                    "R-08",
                    "회사 위치 미확인",
                    "야근 택시 경로에 회사(지정 위치)가 포함되어야 합니다.",
                )
            )

    return out


def cross_check(
    claim: Dict, receipt: Dict, company_keywords: Optional[List[str]] = None
) -> List[Violation]:
    """사용자 신고(claim)와 영수증(receipt) 교차 검증 — 결정적.

    금액(R-01)·날짜(R-05)·업종(R-07) 불일치, 적격증빙 미비(R-01),
    주류/개인물품(R-10·R-06), 야근 택시(R-08)를 검사한다.
    """
    out: List[Violation] = []

    c_amt, r_amt = claim.get("amount"), receipt.get("amount")
    if c_amt is not None and r_amt is not None and int(c_amt) != int(r_amt):
        out.append(
            Violation(
                "심각",
                "R-01",
                f"신고 ₩{int(c_amt):,} ≠ 영수증 ₩{int(r_amt):,}",
                "신고 금액과 영수증 금액이 일치하지 않습니다.",
            )
        )

    c_date, r_date = claim.get("date"), receipt.get("date")
    if c_date and r_date and c_date != r_date:
        out.append(
            Violation(
                "주의",
                "R-05",
                f"신고 {c_date} ≠ 영수증 {r_date}",
                "신고 지출일과 영수증 일자가 다릅니다.",
            )
        )

    c_cat, r_cat = claim.get("category"), receipt.get("category")
    if c_cat and r_cat and c_cat != r_cat:
        out.append(
            Violation(
                "주의",
                "R-07",
                f"신고 {c_cat} ≠ 영수증 {r_cat}",
                "신고 업종과 영수증 업종이 다릅니다.",
            )
        )

    v = check_receipt(r_amt, receipt.get("evidence_type"))
    if v:
        out.append(v)

    if receipt.get("has_alcohol"):
        out.append(
            Violation(
                "누락",
                "R-10",
                "주류 포함",
                "주류가 포함된 접대/식대는 상대방·사유 기재 등 추가 확인이 필요합니다.",
            )
        )
    if receipt.get("has_personal_item"):
        out.append(
            Violation(
                "주의",
                "R-06",
                "개인 물품 포함",
                "영수증에 업무와 무관한 개인 물품이 포함되어 있습니다.",
            )
        )

    if _is_taxi(receipt.get("category", ""), receipt.get("vendor", "")):
        out.extend(check_overtime_taxi_receipt(receipt, company_keywords))

    return out


# --------------------------------------------------------------------------- #
# evaluate_receipt — produce the VerifyResult wire shape                        #
# --------------------------------------------------------------------------- #


def evaluate_receipt(extract: Dict, company_keywords: Optional[List[str]] = None) -> Dict:
    """추출 dict → VerifyResult dict (verdict/receipt/violations/counts).

    금액 판독 불가(amount is None) → REVIEW(판독 불가, PASS 아님).
    """
    amount = extract.get("amount")
    payment_raw = (extract.get("payment_raw") or extract.get("payment_method") or "").strip()
    payment_method = classify_payment(payment_raw) or payment_raw
    category = (extract.get("category") or "").strip()
    vendor = (extract.get("vendor") or "").strip()
    evidence_type = (extract.get("evidence_type") or "").strip()

    receipt = {
        "amount": amount,
        "date": extract.get("date"),
        "vendor": vendor,
        "category": category,
        "payment_method": payment_method,
        "evidence_type": evidence_type,
        "ride_datetime": (extract.get("ride_datetime") or "").strip(),
        "origin": (extract.get("origin") or "").strip(),
        "destination": (extract.get("destination") or "").strip(),
    }

    if amount is None:
        return {
            "verdict": "REVIEW",
            "receipt": receipt,
            "violations": [],
            "counts": {"심각": 0, "주의": 0, "누락": 0},
        }

    violations: List[Violation] = []
    taxi = _is_taxi(category, vendor)

    if taxi:
        violations.extend(check_overtime_taxi_receipt(receipt, company_keywords))
    else:
        v = check_payment_method(payment_method)
        if v:
            violations.append(v)

    v = check_receipt(amount, evidence_type)
    if v:
        violations.append(v)

    counts = {"심각": 0, "주의": 0, "누락": 0}
    for v in violations:
        counts[v.severity] = counts.get(v.severity, 0) + 1

    return {
        "verdict": "FAIL" if violations else "PASS",
        "receipt": receipt,
        "violations": [v.to_dict() for v in violations],
        "counts": counts,
    }


# --------------------------------------------------------------------------- #
# 4.  Image downscaling (long edge <= 1568px) before vision                    #
# --------------------------------------------------------------------------- #


def _prepare_image(image_bytes: bytes, media_type: str, max_edge: int = 1568):
    """긴 변이 max_edge 초과면 JPEG(q85)로 다운스케일. Pillow 없거나 실패 시 원본 반환.

    Returns (bytes, media_type).
    """
    try:
        from PIL import Image  # local import so missing Pillow degrades gracefully

        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        if max(w, h) <= max_edge:
            return image_bytes, media_type

        scale = max_edge / float(max(w, h))
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        img = img.convert("RGB").resize(new_size, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, media_type


# --------------------------------------------------------------------------- #
# Vision extraction (LLM extracts; Pydantic validates; one retry)              #
# --------------------------------------------------------------------------- #

_EXTRACT_PROMPT = """이 이미지는 영수증/카드전표/택시 확인증입니다. 아래 JSON 스키마로만 응답하세요. 설명·마크다운 금지, 순수 JSON만.
{
  "amount": 총 결제금액(정수, 원). 판독 불가 시 null,
  "date": "YYYY-MM-DD" 지출일. 없으면 null,
  "vendor": 상호/가맹점명 (없으면 ""),
  "category": 업종 — 식대/교통비/접대비/출장/경조사비/소모품/기타 중 하나 (없으면 ""),
  "payment_raw": 결제수단 원문 그대로 (예: "현대법인카드","개인카드","현금". 없으면 ""),
  "evidence_type": 증빙 종류 — 카드전표/세금계산서/현금영수증/간이영수증/앱영수증/기타 (없으면 ""),
  "items": 품목 문자열 배열 (없으면 []),
  "has_alcohol": 주류 포함 여부 (true/false),
  "has_personal_item": 개인 물품 포함 여부 (true/false),
  "ride_datetime": 택시 이용시간 "YYYY-MM-DD HH:MM" 또는 "HH:MM~HH:MM" (택시 아니면 ""),
  "origin": 택시 출발지 (없으면 ""),
  "destination": 택시 도착지 (없으면 "")
}
금액이 명확히 보이지 않으면 amount는 반드시 null. 결제수단은 코드가 분류하므로 payment_raw에 원문만 그대로 적으세요."""

_VISION_MODEL = "claude-haiku-4-5"


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("응답에서 JSON을 찾지 못했습니다")
    return json.loads(text[start : end + 1])


def extract_receipt_image(
    image_bytes: bytes,
    media_type: str,
    api_key: str,
    retries: int = 1,
    model: str = _VISION_MODEL,
) -> ReceiptExtract:
    """영수증 이미지 → ReceiptExtract (다운스케일 → 비전 추출 → Pydantic 검증 → 재시도).

    constrained decoding 대신 messages.create + Pydantic 검증 + 1회 재시도를 사용한다
    (이 스키마에서 서버측 grammar 컴파일이 타임아웃되는 문제 회피).
    """
    import anthropic

    prepared, prepared_media = _prepare_image(image_bytes, media_type)
    b64 = base64.standard_b64encode(prepared).decode()
    client = anthropic.Anthropic(api_key=api_key)

    last_err: Optional[Exception] = None
    for _ in range(retries + 1):
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=600,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": prepared_media, "data": b64},
                            },
                            {"type": "text", "text": _EXTRACT_PROMPT},
                        ],
                    }
                ],
            )
            raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
            return ReceiptExtract(**_extract_json(raw))
        except Exception as e:  # noqa: BLE001 — retry on any extraction/validation error
            last_err = e

    raise ValueError(f"영수증 추출 실패: {last_err}")
