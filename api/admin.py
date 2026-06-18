"""SpendSentry 관리자 API — 단일 비밀번호 인증 + 결재 조회/관리.

인증은 표준 hmac 서명 쿠키(stateless)로 처리한다. 외부 라이브러리·서버 세션 저장소가
없어도 서버 재시작에 영향받지 않는다.

필요 환경변수:
  ADMIN_PASSWORD          관리자 비밀번호 (미설정 시 관리자 기능 비활성 → 503)
  ADMIN_SESSION_SECRET    (선택) 쿠키 서명 비밀키. 미설정 시 ADMIN_PASSWORD에서 파생.
  ADMIN_COOKIE_SECURE     (선택) "1"이면 Secure 쿠키(HTTPS 배포용). 기본 비활성(로컬 http).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

import store

router = APIRouter(prefix="/api/admin", tags=["admin"])

_logger = logging.getLogger("spendsentry.admin")
_warned_weak_secret = False

COOKIE_NAME = "sps_admin"
TOKEN_TTL = 12 * 60 * 60  # 12시간
MIN_DERIVED_SECRET_LEN = 16  # 비밀번호 파생 서명키로 충분한 최소 길이


# ──────────────────────────────────────────────────────────────
# 인증 (hmac 서명 쿠키)
# ──────────────────────────────────────────────────────────────
def _password() -> Optional[str]:
    return os.environ.get("ADMIN_PASSWORD") or None


def _secret() -> bytes:
    """쿠키 서명 비밀키. 전용 시크릿이 없으면 비밀번호에서 파생한다
    (비밀번호가 바뀌면 기존 세션이 자동 무효화된다).

    전용 시크릿 없이 짧은 비밀번호로 파생하면, 서명 메시지가 평문 타임스탬프(알려진 평문)라
    탈취된 쿠키로 서명키를 오프라인 역산할 수 있다 → 세션 무결성이 비밀번호 엔트로피에 묶인다.
    이 경우 1회 경고한다(운영 환경에서는 강한 ADMIN_SESSION_SECRET 설정을 권장)."""
    global _warned_weak_secret
    dedicated = os.environ.get("ADMIN_SESSION_SECRET")
    pw = _password() or ""
    if not dedicated and pw and len(pw) < MIN_DERIVED_SECRET_LEN and not _warned_weak_secret:
        _warned_weak_secret = True
        _logger.warning(
            "ADMIN_SESSION_SECRET 미설정 — 쿠키 서명키를 짧은 ADMIN_PASSWORD(%d자)에서 파생합니다. "
            "탈취된 관리자 쿠키로 서명키를 역산당할 수 있으니, 운영 환경에서는 길고 무작위한 "
            "ADMIN_SESSION_SECRET(>=%d자)를 설정하세요.", len(pw), MIN_DERIVED_SECRET_LEN,
        )
    raw = dedicated or pw
    return ("sps:" + raw).encode("utf-8")


def _sign(msg: str) -> str:
    return hmac.new(_secret(), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def _make_token(ttl: int = TOKEN_TTL) -> str:
    expiry = int(time.time()) + ttl
    return f"{expiry}.{_sign(str(expiry))}"


def _verify_token(token: Optional[str]) -> bool:
    if not token or "." not in token:
        return False
    expiry_str, sig = token.rsplit(".", 1)
    if not expiry_str.isdigit() or int(expiry_str) < int(time.time()):
        return False
    return hmac.compare_digest(sig, _sign(expiry_str))


def _is_authenticated(request: Request) -> bool:
    # 비밀번호 미설정이면 발급된 토큰을 신뢰하지 않는다(관리자 비활성).
    if not _password():
        return False
    return _verify_token(request.cookies.get(COOKIE_NAME))


def admin_required(request: Request) -> None:
    """보호 엔드포인트용 의존성. 미인증 시 401."""
    if not _is_authenticated(request):
        raise HTTPException(status_code=401, detail="관리자 인증이 필요합니다.")


# ──────────────────────────────────────────────────────────────
# 인증 엔드포인트
# ──────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    password: str


@router.post("/login")
def login(req: LoginRequest, response: Response):
    expected = _password()
    if not expected:
        raise HTTPException(status_code=503, detail="관리자 비밀번호가 설정되어 있지 않습니다.")
    if not hmac.compare_digest(req.password, expected):
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다.")
    response.set_cookie(
        key=COOKIE_NAME,
        value=_make_token(),
        max_age=TOKEN_TTL,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("ADMIN_COOKIE_SECURE") == "1",
        path="/",
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    """프론트 게이팅용 — 미인증이어도 200으로 상태만 알려준다."""
    return {"authenticated": _is_authenticated(request)}


# ──────────────────────────────────────────────────────────────
# 결재 조회/관리 (모두 admin_required)
# ──────────────────────────────────────────────────────────────
@router.get("/submissions", dependencies=[Depends(admin_required)])
def list_submissions(status: Optional[str] = None, kind: Optional[str] = None,
                     verdict: Optional[str] = None):
    return store.list_submissions(status=status, kind=kind, verdict=verdict)


@router.get("/submissions/{submission_id}", dependencies=[Depends(admin_required)])
def get_submission(submission_id: int):
    row = store.get_submission(submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="결재 건을 찾을 수 없습니다.")
    return row


class UpdateRequest(BaseModel):
    status: Optional[str] = None
    memo: Optional[str] = None


@router.patch("/submissions/{submission_id}", dependencies=[Depends(admin_required)])
def update_submission(submission_id: int, req: UpdateRequest):
    try:
        row = store.update_submission(submission_id, status=req.status, memo=req.memo)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if row is None:
        raise HTTPException(status_code=404, detail="결재 건을 찾을 수 없습니다.")
    return row
