"""SpendSentry 결재 제출 영속 계층 (표준 sqlite3).

영수증 검증·지출결의서 검토 제출을 한 테이블(submissions)에 적재한다.
- verdict: 규칙엔진이 내린 자동 판정(PASS/FAIL/REVIEW) — 불변.
- status : 관리자가 내리는 결재 결정(pending/approved/rejected) — 가변.

신규 외부 의존성 없음. 저수준 connection은 호출마다 새로 열어 스레드 안전을 단순하게 유지한다.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from typing import Optional

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VALID_STATUS = ("pending", "approved", "rejected")


def _db_path() -> str:
    """DB 파일 경로. SPENDSENTRY_DB로 오버라이드 가능(테스트·배포 분리용)."""
    return os.environ.get("SPENDSENTRY_DB") or os.path.join(BASE, "data", "spendsentry.db")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # WAL + busy timeout: 동시 best-effort 쓰기가 'database is locked'로 조용히 유실되지 않도록.
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")  # 동시 쓰기 잠금 시 최대 30s 대기
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db() -> None:
    """테이블 생성(존재하면 무시). 모듈 import 시 1회 호출된다."""
    with closing(_connect()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at  TEXT    NOT NULL,
                kind        TEXT    NOT NULL,
                verdict     TEXT    NOT NULL,
                summary     TEXT    NOT NULL,
                amount      INTEGER,
                payload     TEXT    NOT NULL,
                status      TEXT    NOT NULL DEFAULT 'pending',
                memo        TEXT    NOT NULL DEFAULT '',
                decided_at  TEXT
            )
            """
        )


def insert_submission(kind: str, verdict: str, summary: str,
                      amount: Optional[int], payload: dict) -> int:
    """제출 1건 적재 후 id 반환."""
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO submissions (created_at, kind, verdict, summary, amount, payload) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (_now(), kind, verdict, summary, amount, json.dumps(payload, ensure_ascii=False)),
        )
        return int(cur.lastrowid)


def list_submissions(status: Optional[str] = None, kind: Optional[str] = None,
                     verdict: Optional[str] = None) -> list[dict]:
    """필터링된 제출 목록(최신순). 가벼운 행을 위해 payload는 제외한다."""
    clauses, params = [], []
    for col, val in (("status", status), ("kind", kind), ("verdict", verdict)):
        if val:
            clauses.append(f"{col} = ?")
            params.append(val)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, created_at, kind, verdict, summary, amount, status, memo, decided_at "
            f"FROM submissions {where} ORDER BY id DESC",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_submission(submission_id: int) -> Optional[dict]:
    """단건 상세(payload JSON 파싱 포함). 없으면 None."""
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT * FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
    if row is None:
        return None
    out = dict(row)
    out["payload"] = json.loads(out["payload"]) if out["payload"] else None
    return out


def update_submission(submission_id: int, status: Optional[str] = None,
                      memo: Optional[str] = None) -> Optional[dict]:
    """관리자 결정(status)·메모 갱신. 종결 결정(승인/반려)이면 decided_at을 기록하고,
    pending으로 되돌리면(결정 취소) decided_at을 비운다.

    대상이 없으면 None, status 값이 부적절하면 ValueError.
    """
    if status is not None and status not in VALID_STATUS:
        raise ValueError(f"invalid status: {status}")

    sets, params = [], []
    if status is not None:
        sets += ["status = ?", "decided_at = ?"]
        # pending(재오픈)은 '결재 완료' 시각이 아니므로 decided_at을 초기화한다.
        params += [status, _now() if status != "pending" else None]
    if memo is not None:
        sets.append("memo = ?")
        params.append(memo)
    if not sets:
        return get_submission(submission_id)

    params.append(submission_id)
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            f"UPDATE submissions SET {', '.join(sets)} WHERE id = ?", params
        )
        if cur.rowcount == 0:
            return None
    return get_submission(submission_id)
