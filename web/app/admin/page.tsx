"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminMe, adminLogin, adminLogout,
  listSubmissions, getSubmission, updateSubmission,
} from "@/lib/admin";
import type {
  Submission, SubmissionDetail, SubmissionStatus,
  VerifyResult, ReportPayload,
} from "@/lib/types";

// ── Apple 스타일 팔레트/메타 (이 콘솔 전용; 토스 디자인 토큰과 분리) ──
const VERDICT: Record<VerifyResult["verdict"], { label: string; dot: string }> = {
  PASS: { label: "PASS", dot: "#0066cc" },
  FAIL: { label: "FAIL", dot: "#d70015" },
  REVIEW: { label: "검증 불가", dot: "#86868b" },
};
const STATUS: Record<SubmissionStatus, { label: string; dot: string; fg: string }> = {
  pending: { label: "대기", dot: "#86868b", fg: "#86868b" },
  approved: { label: "승인", dot: "#0066cc", fg: "#0066cc" },
  rejected: { label: "반려", dot: "#d70015", fg: "#d70015" },
};
const SEV: Record<string, { dot: string; fg: string }> = {
  심각: { dot: "#d70015", fg: "#d70015" },
  주의: { dot: "#1d1d1f", fg: "#1d1d1f" },
  누락: { dot: "#86868b", fg: "#86868b" },
};

const won = (n: number | null | undefined) => (n == null ? "—" : "₩" + n.toLocaleString());
const pad = (x: number) => String(x).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // 로컬 날짜
const fmtStamp = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// 표시(fmtStamp)와 동일하게 로컬 기준 날짜로 — KPI '오늘'·기간 필터가 화면 시각과 어긋나지 않도록.
const rawDate = (iso: string) => ymd(new Date(iso));

// ── 작은 아이콘들 ──
const Brand = ({ size, stroke = "#fff", sw = 1.6 }: { size: number; stroke?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 3h12l4 4v14l-3-1.5L14 21l-3-1.5L8 21l-3-1.5L4 21z" /><path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);
const Chevron = ({ d = "right", size = 16, stroke = "#c7c7cc", sw = 1.8 }: { d?: "right" | "left"; size?: number; stroke?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d === "right" ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
  </svg>
);
const Search = ({ stroke = "#7a7a7a" }: { stroke?: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

const chip = (active: boolean): React.CSSProperties => ({
  border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
  borderRadius: 9999, padding: "7px 14px",
  background: active ? "#0066cc" : "rgba(0,0,0,0.05)", color: active ? "#fff" : "#1d1d1f",
});
const sectionLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#a1a1a6", letterSpacing: "0.2px", textTransform: "uppercase",
};

type StatusFilter = "all" | SubmissionStatus;
type KindFilter = "all" | "receipt" | "report";
type PeriodFilter = "all" | "today" | "7" | "30";

export default function AdminConsole() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [subs, setSubs] = useState<Submission[]>([]);
  const [listErr, setListErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState<StatusFilter>("all");
  const [fKind, setFKind] = useState<KindFilter>("all");
  const [fPeriod, setFPeriod] = useState<PeriodFilter>("all");
  const [query, setQuery] = useState("");

  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [draftMemo, setDraftMemo] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  const today = useMemo(() => ymd(new Date()), []);

  // 인증 확인 → 목록 로드
  useEffect(() => { adminMe().then(setAuthed); }, []);

  const load = useCallback(async () => {
    try {
      const rows = await listSubmissions({});
      setSubs(rows);
      setListErr("");
    } catch (e) {
      if (e instanceof Error && e.message.includes("401")) setAuthed(false);
      else setListErr(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function doLogin() {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      await adminLogin(pw);
      setPw(""); setLoginErr(""); setAuthed(true);
    } catch (e) {
      setLoginErr(e instanceof Error && e.message.includes("401") ? "비밀번호가 올바르지 않습니다." : "로그인에 실패했습니다.");
    } finally {
      setLoggingIn(false);
    }
  }
  async function logout() {
    await adminLogout().catch(() => {});
    setAuthed(false); setSubs([]); setSelId(null); setDetail(null);
  }

  // 클라이언트 필터 (디자인과 동일하게 즉시 반영)
  const inPeriod = (iso: string) => {
    if (fPeriod === "all") return true;
    const diff = Math.round((+new Date(today) - +new Date(rawDate(iso))) / 86400000);
    if (fPeriod === "today") return diff === 0;
    if (fPeriod === "7") return diff >= 0 && diff <= 6;
    return diff >= 0 && diff <= 29;
  };
  const list = useMemo(() => {
    const q = query.trim();
    return subs.filter((s) =>
      (fStatus === "all" || s.status === fStatus) &&
      (fKind === "all" || s.kind === fKind) &&
      inPeriod(s.created_at) &&
      (q === "" || (s.summary + " " + s.id).includes(q)),
    );
  }, [subs, fStatus, fKind, fPeriod, query, today]);

  // 선택 유지: 필터로 사라지면 첫 행 선택
  useEffect(() => {
    if (!list.length) { setSelId(null); return; }
    if (selId == null || !list.some((s) => s.id === selId)) setSelId(list[0].id);
  }, [list, selId]);

  const sel = useMemo(() => subs.find((s) => s.id === selId) ?? null, [subs, selId]);

  // 선택 변경 → 상세(payload) 로드 + 메모 초안 동기화
  useEffect(() => {
    if (selId == null) { setDetail(null); return; }
    setDraftMemo(sel?.memo ?? "");
    let alive = true;
    getSubmission(selId)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (e instanceof Error && e.message.includes("401")) setAuthed(false); });
    return () => { alive = false; };
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyUpdated(u: SubmissionDetail) {
    setSubs((prev) => prev.map((s) => (s.id === u.id ? {
      id: u.id, created_at: u.created_at, kind: u.kind, verdict: u.verdict,
      summary: u.summary, amount: u.amount, status: u.status, memo: u.memo, decided_at: u.decided_at,
    } : s)));
    setDetail(u);
  }
  async function mutate(patch: { status?: SubmissionStatus; memo?: string }) {
    if (selId == null) return;
    try { applyUpdated(await updateSubmission(selId, patch)); }
    catch (e) {
      if (e instanceof Error && e.message.includes("401")) setAuthed(false);
      else setListErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    }
  }
  const saveMemo = () => { if (sel && draftMemo !== sel.memo) mutate({ memo: draftMemo }); };
  const approve = () => mutate({ status: "approved", memo: draftMemo });
  const reject = () => mutate({ status: "rejected", memo: draftMemo });
  const reopen = () => mutate({ status: "pending" });

  const root: React.CSSProperties = {
    height: "100dvh", display: "flex", flexDirection: "column", background: "#f5f5f7",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    color: "#1d1d1f", letterSpacing: "-0.374px", overflow: "hidden",
  };

  if (authed === null) return <div style={root} />;

  // ───────────────────────── 로그인 ─────────────────────────
  if (!authed) {
    return (
      <div style={root} className="ap-console">
        <div style={{ height: 48, flexShrink: 0, background: "#000", color: "#fff", display: "flex", alignItems: "center", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Brand size={17} /><span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px" }}>SpendSentry</span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: 360, animation: "apRise 400ms ease-out" }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px" }}>
              <Brand size={26} sw={1.5} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.5px", textAlign: "center" }}>관리자 결재 콘솔</div>
            <div style={{ fontSize: 14.5, color: "#7a7a7a", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>계속하려면 관리자 비밀번호를 입력하세요.</div>
            <form style={{ marginTop: 28 }} onSubmit={(e) => { e.preventDefault(); doLogin(); }}>
              <input
                type="password" value={pw} placeholder="비밀번호" disabled={loggingIn} autoFocus
                onChange={(e) => setPw(e.target.value)}
                style={{ width: "100%", height: 48, border: `1px solid ${loginErr ? "#e0a59f" : "#d0d0d4"}`, borderRadius: 9999, padding: "0 20px", fontFamily: "inherit", fontSize: 16, color: "#1d1d1f", letterSpacing: "-0.3px" }}
              />
              {loginErr && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 4px 0", color: "#d70015", fontSize: 13 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                  {loginErr}
                </div>
              )}
              <button type="submit" disabled={loggingIn} style={{ width: "100%", height: 48, marginTop: 14, background: "#0066cc", color: "#fff", border: 0, borderRadius: 9999, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: loggingIn ? "default" : "pointer", opacity: loggingIn ? 0.6 : 1 }}>{loggingIn ? "확인 중…" : "로그인"}</button>
            </form>
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #e0e0e0", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#a1a1a6", lineHeight: 1.6 }}>세션은 12시간 동안 유지됩니다.<br />접근 권한은 경영지원팀 관리자에게 문의하세요.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────── 콘솔 ─────────────────────────
  const pending = subs.filter((s) => s.status === "pending").length;
  const todayCnt = subs.filter((s) => rawDate(s.created_at) === today).length;
  const failCnt = subs.filter((s) => s.verdict === "FAIL").length;
  const decided = subs.filter((s) => s.status !== "pending");
  const rate = decided.length ? Math.round((decided.filter((s) => s.status === "approved").length / decided.length) * 100) : 0;
  const cnt = (v: StatusFilter) => (v === "all" ? subs.length : subs.filter((s) => s.status === v).length);

  const payload = detail && detail.id === selId ? detail.payload : null;
  const isReceipt = sel?.kind === "receipt";
  const receipt = isReceipt ? (payload as VerifyResult | null)?.receipt ?? null : null;
  const report = !isReceipt ? (payload as ReportPayload | null) ?? null : null;
  const violations = (payload as { violations?: ReportPayload["violations"] } | null)?.violations ?? [];

  const meta: { k: string; v: string }[] = [];
  if (receipt) {
    const push = (k: string, v: string | null) => { if (v && v !== "—") meta.push({ k, v }); };
    push("결제수단", receipt.payment_method); push("업종", receipt.category);
    push("증빙", receipt.evidence_type); push("일자", receipt.date);
    push("이용 시각", receipt.ride_datetime);
    if (receipt.origin || receipt.destination) meta.push({ k: "경로", v: `${receipt.origin || "—"} → ${receipt.destination || "—"}` });
  }
  // 결의서 항목 — payload 형태가 가변이라 방어적으로 매핑
  const rItems = (Array.isArray(report?.report?.items) ? (report!.report!.items as Record<string, unknown>[]) : []).map((it) => {
    const num = (x: unknown) => (typeof x === "number" ? x : null);
    const qty = num(it.qty) ?? num(it.quantity);
    const unit = num(it.unit) ?? num(it.unit_price);
    const amount = num(it.amount) ?? (unit != null && qty != null ? unit * qty : unit);
    return {
      name: String(it.name ?? it.item ?? it.label ?? "항목"),
      unitText: unit != null && qty != null ? `₩${unit.toLocaleString()} × ${qty}` : "",
      amount: amount ?? null,
    };
  });
  const rItemsTotal = rItems.reduce((a, it) => a + (it.amount ?? 0), 0);
  const approvalDate = report?.report?.approval_date ?? null;
  const spendDate = report?.report?.spend_date ?? null;
  const r05ok = approvalDate != null && spendDate != null && approvalDate <= spendDate;

  return (
    <div style={root} className="ap-console">
      {/* 상단 바 */}
      <div style={{ height: 48, flexShrink: 0, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Brand size={17} /><span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.3px" }}>SpendSentry</span>
          </div>
          <span style={{ width: 1, height: 15, background: "rgba(255,255,255,.24)" }} />
          <span style={{ fontSize: 13, fontWeight: 400, color: "#d6d6d8" }}>관리자 결재 콘솔</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 12, color: "#a1a1a6" }}>관리자</span>
          <button onClick={logout} style={{ background: "transparent", border: 0, color: "#2997ff", fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>로그아웃</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* 접힌 패널 펼치기 탭 */}
        {!panelOpen && (
          <button onClick={() => setPanelOpen(true)} aria-label="상세 펼치기"
            style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)", zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: "#fff", border: "1px solid #e0e0e0", borderRight: 0, borderRadius: "12px 0 0 12px", padding: "14px 9px", cursor: "pointer", fontFamily: "inherit", boxShadow: "-3px 0 14px rgba(0,0,0,.05)" }}>
            <Chevron d="left" stroke="#0066cc" sw={2} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#5a5a5e", writingMode: "vertical-rl", letterSpacing: "1px" }}>상세</span>
          </button>
        )}

        {/* 좌측: 헤더 + KPI + 필터 + 리스트 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "28px 32px 18px", flexShrink: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.6px", lineHeight: 1.1 }}>결재 대기 현황</div>
            <div style={{ fontSize: 15, color: "#7a7a7a", marginTop: 6 }}>규칙엔진이 자동 판정한 제출 건을 검토하고 승인 또는 반려하세요.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginTop: 22 }}>
              {[
                { k: "결재 대기", v: pending, u: "건" },
                { k: "오늘 제출", v: todayCnt, u: "건" },
                { k: "자동 판정 FAIL", v: failCnt, u: "건" },
                { k: "승인율", v: rate, u: "%" },
              ].map((c) => (
                <div key={c.k} style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 18, padding: "18px 20px" }}>
                  <div style={{ fontSize: 13, color: "#7a7a7a" }}>{c.k}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 9 }}>
                    <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.5px" }}>{c.v}</span>
                    <span style={{ fontSize: 14, color: "#7a7a7a" }}>{c.u}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 필터 바 */}
          <div style={{ minHeight: 56, flexShrink: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 14px", padding: "10px 32px", background: "rgba(245,245,247,.8)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderTop: "1px solid rgba(0,0,0,.06)", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => setFStatus("all")} style={chip(fStatus === "all")}>전체 {cnt("all")}</button>
              <button onClick={() => setFStatus("pending")} style={chip(fStatus === "pending")}>대기 {cnt("pending")}</button>
              <button onClick={() => setFStatus("approved")} style={chip(fStatus === "approved")}>승인 {cnt("approved")}</button>
              <button onClick={() => setFStatus("rejected")} style={chip(fStatus === "rejected")}>반려 {cnt("rejected")}</button>
            </div>
            <span style={{ width: 1, height: 20, background: "rgba(0,0,0,.1)" }} />
            <div style={{ display: "flex", gap: 7 }}>
              {([["all", "전체"], ["receipt", "영수증"], ["report", "결의서"]] as [KindFilter, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setFKind(v)} style={chip(fKind === v)}>{l}</button>
              ))}
            </div>
            <span style={{ width: 1, height: 20, background: "rgba(0,0,0,.1)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
              {([["all", "전체"], ["today", "오늘"], ["7", "7일"], ["30", "30일"]] as [PeriodFilter, string][]).map(([v, l]) => (
                <button key={v} onClick={() => setFPeriod(v)} style={chip(fPeriod === v)}>{l}</button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 9999, padding: "0 16px", height: 38, width: 208 }}>
              <Search />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색" style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 13.5, color: "#1d1d1f", width: "100%", letterSpacing: "-0.2px" }} />
            </div>
          </div>

          {/* 리스트 */}
          <div className="ap-sb" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "14px 32px 40px" }}>
            {listErr && <div style={{ color: "#d70015", fontSize: 13, padding: "8px 2px" }}>{listErr}</div>}
            {loading && subs.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "#a1a1a6", fontSize: 15 }}>불러오는 중…</div>
            ) : list.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "#a1a1a6" }}>
                <Search stroke="#c7c7cc" />
                <div style={{ fontSize: 15, marginTop: 14 }}>조건에 맞는 제출 건이 없습니다.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.map((s) => {
                  const on = s.id === selId;
                  const v = VERDICT[s.verdict], ss = STATUS[s.status];
                  return (
                    <button key={s.id} onClick={() => { setSelId(s.id); setPanelOpen(true); }}
                      style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 16, background: "#fff", border: `1px solid ${on ? "#0066cc" : "#e0e0e0"}`, borderRadius: 18, padding: "16px 18px", boxShadow: on ? "0 0 0 3px rgba(0,102,204,0.12)" : "none" }}>
                      <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 11, background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", color: "#1d1d1f" }}>
                        {s.kind === "receipt" ? (
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l3 3v15l-2.4-1.4L15 21l-2.5-1.4L10 21l-2.5-1.4L5 21z" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></svg>
                        ) : (
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 12h6M9 16h6" /></svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "#a1a1a6", fontVariantNumeric: "tabular-nums" }}>#{s.id}</span>
                          <span style={{ fontSize: 12, color: "#c7c7cc" }}>·</span>
                          <span style={{ fontSize: 12, color: "#a1a1a6" }}>{s.kind === "receipt" ? "영수증 검증" : "지출결의서"}</span>
                        </div>
                        <div style={{ fontSize: 15.5, fontWeight: 500, marginTop: 3, letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.summary}</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: "right", minWidth: 104 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }}>{won(s.amount)}</div>
                        <div style={{ fontSize: 11.5, color: "#a1a1a6", marginTop: 3 }}>{fmtStamp(s.created_at)}</div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: 96 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, borderRadius: 9999, padding: "3px 10px", background: "#f5f5f7", color: "#1d1d1f" }}>
                          <span style={{ width: 6, height: 6, borderRadius: 9999, background: v.dot }} />{v.label}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: ss.fg }}>{ss.label}</span>
                      </div>
                      <Chevron stroke={on ? "#0066cc" : "#c7c7cc"} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 상세 패널 */}
        <div style={{ flexShrink: 0, width: panelOpen ? 452 : 0, borderLeft: panelOpen ? "1px solid #e0e0e0" : "none", overflow: "hidden", transition: "width 320ms cubic-bezier(.2,.8,.2,1)" }}>
          <div className="ap-sb" style={{ width: 452, height: "100%", background: "#fff", overflowY: "auto" }}>
            {!sel ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center", color: "#a1a1a6" }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l3 3v15l-2.4-1.4L15 21l-2.5-1.4L10 21l-2.5-1.4L5 21z" /><path d="M8.5 8h7M8.5 12h7" /></svg>
                </div>
                <div style={{ fontSize: 15, color: "#7a7a7a" }}>왼쪽에서 제출 건을 선택하면<br />상세 내역이 여기에 표시됩니다.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", animation: "apFade 240ms ease-out" }}>
                {/* 상세 헤더 */}
                <div style={{ padding: "26px 28px 22px", borderBottom: "1px solid #f0f0f2" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, borderRadius: 9999, padding: "5px 13px", background: "#f5f5f7", color: "#1d1d1f" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 9999, background: VERDICT[sel.verdict].dot }} />자동 판정 · {VERDICT[sel.verdict].label}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "#a1a1a6", fontVariantNumeric: "tabular-nums" }}>{sel.kind === "receipt" ? "영수증 검증" : "지출결의서"} · #{sel.id}</span>
                      <button onClick={() => setPanelOpen(false)} aria-label="상세 접기" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7a7a7a" }}>
                        <Chevron stroke="currentColor" size={15} sw={2} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", marginTop: 16, lineHeight: 1.25 }}>{sel.summary}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                    <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.6px", fontVariantNumeric: "tabular-nums" }}>{won(sel.amount)}</span>
                    <span style={{ fontSize: 13, color: "#a1a1a6" }}>{fmtStamp(sel.created_at)} 제출</span>
                  </div>
                </div>

                {/* 영수증: 제출 정보 */}
                {isReceipt && meta.length > 0 && (
                  <div style={{ padding: "22px 28px", borderBottom: "1px solid #f0f0f2" }}>
                    <div style={{ ...sectionLabel, marginBottom: 14 }}>제출 정보</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px" }}>
                      {meta.map((m) => (
                        <div key={m.k}>
                          <div style={{ fontSize: 12.5, color: "#7a7a7a" }}>{m.k}</div>
                          <div style={{ fontSize: 15, fontWeight: 500, marginTop: 3, letterSpacing: "-0.2px" }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 결의서: 지출 절차 + 항목 */}
                {!isReceipt && report && (
                  <>
                    {(approvalDate || spendDate) && (
                      <div style={{ padding: "22px 28px", borderBottom: "1px solid #f0f0f2" }}>
                        <div style={{ ...sectionLabel, marginBottom: 14 }}>지출 절차</div>
                        <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                          <div style={{ flex: 1, background: "#f5f5f7", borderRadius: 14, padding: "13px 15px" }}>
                            <div style={{ fontSize: 12, color: "#7a7a7a" }}>품의 승인</div>
                            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{approvalDate || "—"}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", color: "#c7c7cc" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                          </div>
                          <div style={{ flex: 1, background: "#f5f5f7", borderRadius: 14, padding: "13px 15px" }}>
                            <div style={{ fontSize: 12, color: "#7a7a7a" }}>실제 지출</div>
                            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{spendDate || "—"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, background: "#f5f5f7", borderRadius: 12, padding: "11px 14px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r05ok ? "#0066cc" : "#d70015"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={r05ok ? "M20 6 9 17l-5-5" : "M12 8v5M12 16h.01"} /></svg>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: r05ok ? "#0066cc" : "#d70015" }}>{r05ok ? "사전 승인 충족 (R-05)" : "사후 정산 — R-05 위반 소지"}</span>
                        </div>
                      </div>
                    )}
                    {rItems.length > 0 && (
                      <div style={{ padding: "22px 28px", borderBottom: "1px solid #f0f0f2" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <div style={sectionLabel}>지출 항목</div>
                          <span style={{ fontSize: 12, color: "#7a7a7a" }}>{rItems.length}건</span>
                        </div>
                        <div style={{ border: "1px solid #ececef", borderRadius: 14, overflow: "hidden" }}>
                          {rItems.map((it, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 15px", borderBottom: "1px solid #f2f2f4" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.2px" }}>{it.name}</div>
                                {it.unitText && <div style={{ fontSize: 12, color: "#a1a1a6", marginTop: 2 }}>{it.unitText}</div>}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{won(it.amount)}</div>
                            </div>
                          ))}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", background: "#fafafc" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#7a7a7a" }}>합계</span>
                            <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{won(rItemsTotal)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 규칙 검토 결과 */}
                <div style={{ padding: "22px 28px", borderBottom: "1px solid #f0f0f2" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={sectionLabel}>규칙 검토 결과</div>
                    {violations.length > 0 && <span style={{ fontSize: 12, color: "#7a7a7a" }}>위반 {violations.length}건</span>}
                  </div>
                  {payload && violations.length === 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#f5f5f7", borderRadius: 14, padding: "15px 16px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      <div style={{ fontSize: 14, color: "#1d1d1f" }}>모든 회사 규정을 충족합니다.</div>
                    </div>
                  )}
                  {!payload && <div style={{ fontSize: 13.5, color: "#a1a1a6" }}>불러오는 중…</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {violations.map((v, i) => {
                      const m = SEV[v.severity] ?? SEV["주의"];
                      return (
                        <div key={i} style={{ background: "#f5f5f7", borderRadius: 14, padding: "15px 16px", animation: "apIn 300ms ease-out" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 9999, background: m.dot }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: m.fg }}>{v.severity}</span>
                            <span style={{ fontSize: 11.5, color: "#7a7a7a" }}>· {v.rule} {v.rule_tag}</span>
                          </div>
                          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.2px" }}>{v.item}</div>
                          <div style={{ fontSize: 13.5, color: "#5a5a5e", marginTop: 5, lineHeight: 1.5 }}>{v.detail}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 관리자 메모 */}
                <div style={{ padding: "22px 28px 26px", flex: 1 }}>
                  <div style={{ ...sectionLabel, marginBottom: 12 }}>관리자 메모</div>
                  <textarea value={draftMemo} onChange={(e) => setDraftMemo(e.target.value)} onBlur={saveMemo}
                    placeholder="결재 사유나 보완 요청 사항을 기록하세요."
                    style={{ width: "100%", minHeight: 74, resize: "vertical", border: "1px solid #e0e0e0", borderRadius: 14, padding: "13px 15px", fontFamily: "inherit", fontSize: 14, color: "#1d1d1f", lineHeight: 1.5, letterSpacing: "-0.2px" }} />
                  {sel.status !== "pending" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: "#7a7a7a" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 9999, padding: "3px 10px", background: "#f5f5f7", color: "#1d1d1f" }}>
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: STATUS[sel.status].dot }} />{STATUS[sel.status].label}
                      </span>
                      <span>{fmtStamp(sel.decided_at)} 결재 완료</span>
                      <button onClick={reopen} style={{ marginLeft: "auto", background: "transparent", border: 0, color: "#0066cc", fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>결정 취소</button>
                    </div>
                  )}
                </div>

                {/* 액션 */}
                <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.85)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderTop: "1px solid #e0e0e0", padding: "16px 28px", display: "flex", gap: 10 }}>
                  <button onClick={reject} style={{ flex: 1, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500, borderRadius: 9999, padding: 13, border: "1px solid #e0e0e0", background: "#fff", color: "#d70015", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>반려
                  </button>
                  <button onClick={approve} style={{ flex: 1, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 500, borderRadius: 9999, padding: 13, border: 0, background: "#0066cc", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>승인
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
