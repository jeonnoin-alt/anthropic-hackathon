"""SpendSentry FastAPI 백엔드.

엔드포인트:
- POST /api/chat            결정적 라우팅(LangGraph) + 자유질문 스트리밍 (text/plain)
- POST /api/verify-receipt  비전 추출(다운스케일) + 결정적 규칙엔진 → VerifyResult
- GET  /api/health          모델/키 상태

설계 원칙: LLM은 추출·대화만, 판정·금액·날짜·임계 계산은 전부 결정적 코드(graph/).
"""

import os
import sys
from typing import List

# graph 패키지(상위 폴더)와 로컬 모듈(api/) 둘 다 임포트 가능하도록 경로 보강.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _p in (_ROOT, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import anthropic

from policy import CHAT_MODEL, SYSTEM_PROMPT, VISION_MODEL

from graph.receipt import evaluate_receipt, extract_receipt_image
from graph.rules import POLICY
from graph.spendsentry_graph import (
    REFUSAL,
    _extract_report,
    classify,
    evaluate_report,
    match_standard_question,
    render_report,
)

import admin
import store

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
client = anthropic.Anthropic(api_key=API_KEY) if API_KEY else None

# R-08 회사 위치 키워드 (선택) — 비어 있으면 위치 검사 생략(오탐 방지).
_kw = os.environ.get("COMPANY_LOCATION_KEYWORDS", "").strip()
COMPANY_KEYWORDS = [k.strip() for k in _kw.split(",") if k.strip()]
if COMPANY_KEYWORDS:
    POLICY["company_location_keywords"] = COMPANY_KEYWORDS

app = FastAPI(title="SpendSentry API")

# 관리자 인증은 쿠키 기반이라 credentials 허용(origin은 명시 — 와일드카드 동시 사용 불가).
# Next 프록시 경유 시 동일 origin이라 CORS는 무해.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
store.init_db()


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatTurn]


@app.get("/api/health")
def health():
    return {"ok": True, "model": CHAT_MODEL, "key_set": bool(API_KEY)}


def _chunks(text: str, size: int = 18):
    """결정적 답변을 토큰처럼 잘게 흘려보내 타이핑 효과를 준다."""
    for i in range(0, len(text), size):
        yield text[i : i + size]


def _stream_llm(msgs):
    """자유 형식 질문 — 정책 system 프롬프트 + 전체 히스토리로 스트리밍."""
    with client.messages.stream(
        model=CHAT_MODEL,
        max_tokens=1500,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=msgs,
    ) as stream:
        for text in stream.text_stream:
            yield text


def _capture_report(text: str, structured: dict, violations) -> None:
    """평가된 지출결의서를 결재 리스트에 적재(best-effort). 실패해도 응답을 막지 않는다."""
    try:
        verdict = "FAIL" if violations else "PASS"
        items = structured.get("items") or []
        summary = f"지출결의서 · 항목 {len(items)}건"
        payload = {
            "input": text,
            "report": {
                "items": items,
                "approval_date": structured.get("approval_date"),
                "spend_date": structured.get("spend_date"),
            },
            "violations": [v.to_dict() for v in violations],
        }
        store.insert_submission("report", verdict, summary, None, payload)
    except Exception:
        pass


@app.post("/api/chat")
def chat(req: ChatRequest):
    msgs = [{"role": m.role, "content": m.content} for m in req.messages if m.content]
    if not msgs:
        raise HTTPException(status_code=400, detail="empty messages")

    last_user = next((m["content"] for m in reversed(msgs) if m["role"] == "user"), "")
    prior_assistant = any(m["role"] == "assistant" for m in msgs[:-1])
    route = classify({"input": last_user})["route"]

    # 결정적 라우트(scope, 첫 턴 standard)는 키 없이도 동작. LLM/보고서 추출만 키 필요.
    deterministic = route == "scope" or (route == "standard" and not prior_assistant)
    if not deterministic and client is None:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    def gen():
        # 범위 밖 질문은 대화 도중에도 항상 결정적으로 거절.
        if route == "scope":
            yield from _chunks(REFUSAL)
            return

        # 후속(꼬리) 질문은 맥락 유지를 위해 LLM으로 — 멀티턴 보존.
        if route == "standard" and not prior_assistant:
            hit = match_standard_question(last_user)
            yield from _chunks(hit[1] if hit else REFUSAL)
            return

        if route == "report" and not prior_assistant:
            try:
                structured = _extract_report(last_user, API_KEY, model=CHAT_MODEL)
                if structured.get("items"):
                    violations = evaluate_report(structured)
                    _capture_report(last_user, structured, violations)  # 결재 리스트 적재
                    yield from _chunks(render_report(violations))
                    return
            except Exception:
                pass  # 추출 실패 → 대화형 LLM 보고서로 폴백

        # report(폴백 포함) + llm + 후속 질문 → 정책 프롬프트로 스트리밍
        yield from _stream_llm(msgs)

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@app.post("/api/verify-receipt")
async def verify_receipt(file: UploadFile = File(...)):
    if client is None:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일입니다")

    content_type = file.content_type or ""
    media = "image/png" if content_type.endswith("png") else "image/jpeg"

    try:
        extract = extract_receipt_image(data, media, API_KEY, retries=1, model=VISION_MODEL)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"영수증 판독 실패: {e}")

    result = evaluate_receipt(extract.model_dump(), company_keywords=COMPANY_KEYWORDS or None)

    # 결재 리스트 적재 (관리자 페이지용). 적재 실패가 검증 응답을 막지 않도록 best-effort.
    try:
        r = result["receipt"]
        label = r.get("vendor") or r.get("category") or "—"
        summary = f"영수증 · ₩{(r.get('amount') or 0):,} · {label}"
        store.insert_submission("receipt", result["verdict"], summary, r.get("amount"), result)
    except Exception:
        pass

    return result
