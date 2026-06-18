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
_PBKDF2_ITERS = 100_000     # 비밀번호 파생 시 신장 강도 (오프라인 역산 비용)
_PBKDF2_SALT = b"sps-admin-cookie-v1"
_LOGIN_FAIL_DELAY = 0.5     # 실패 로그인 지연(초) — 무차별 대입 속도 완화
_key_cache: dict[str, bytes] = {}  # 파생 키 캐시 (요청마다 pbkdf2 재계산 방지)


# ──────────────────────────────────────────────────────────────
# 인증 (hmac 서명 쿠키)
# ──────────────────────────────────────────────────────────────
def _password() -> Optional[str]:
    return os.environ.get("ADMIN_PASSWORD") or None


def _secret() -> bytes:
    """쿠키 서명 비밀키. 전용 시크릿이 없으면 비밀번호에서 파생한다
    (비밀번호가 바뀌면 기존 세션이 자동 무효화된다).

    전용 시크릿 없이 비밀번호로 파생할 때는, 서명 메시지가 평문 타임스탬프(알려진 평문)라
    탈취된 쿠키로 서명키를 오프라인 역산당할 수 있다. 이를 비싸게 만들기 위해 비밀번호
    파생 경로는 PBKDF2(SHA-256, _PBKDF2_ITERS회)로 신장한다. 짧은 비밀번호면 1회 경고도
    남긴다(운영 환경에서는 길고 무작위한 ADMIN_SESSION_SECRET 설정을 권장)."""
    global _warned_weak_secret
    dedicated = os.environ.get("ADMIN_SESSION_SECRET")
    pw = _password() or ""
    raw = dedicated or pw
    cache_key = ("D:" if dedicated else "P:") + raw
    cached = _key_cache.get(cache_key)
    if cached is not None:
        return cached

    if not dedicated and pw and len(pw) < MIN_DERIVED_SECRET_LEN and not _warned_weak_secret:
        _warned_weak_secret = True
        _logger.warning(
            "ADMIN_SESSION_SECRET 미설정 — 쿠키 서명키를 ADMIN_PASSWORD(%d자)에서 PBKDF2로 파생합니다. "
            "운영 환경에서는 길고 무작위한 ADMIN_SESSION_SECRET(>=%d자)를 설정하세요.",
            len(pw), MIN_DERIVED_SECRET_LEN,
        )

    material = ("sps:" + raw).encode("utf-8")
    if dedicated:
        # 전용 시크릿은 고엔트로피로 가정 — 그대로 사용.
        key = material
    else:
        # 비밀번호 파생 — PBKDF2로 신장해 탈취 쿠키의 오프라인 역산을 비싸게 만든다.
        key = hashlib.pbkdf2_hmac("sha256", material, _PBKDF2_SALT, _PBKDF2_ITERS)
    _key_cache[cache_key] = key
    return key


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
        # 단일 비밀번호 게이트 — 실패 시 짧게 지연해 무차별 대입 처리율을 낮춘다.
        time.sleep(_LOGIN_FAIL_DELAY)
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
    # set_cookie와 동일한 속성으로 삭제 — 일부 브라우저의 '쿠키 미삭제' 버그 회피.
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=os.environ.get("ADMIN_COOKIE_SECURE") == "1",
    )
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
