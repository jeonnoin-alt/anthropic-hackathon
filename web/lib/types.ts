export type Severity = "심각" | "주의" | "누락";

/** 심각도별 표시 메타 (이모지·라벨·색상) — 단일 진실 공급원. */
export const SEVERITY_META: Record<Severity, { icon: string; label: string; dot: string; bg: string }> = {
  심각: { icon: "🔴", label: "심각", dot: "bg-toss-red", bg: "bg-red-50" },
  주의: { icon: "🟡", label: "주의", dot: "bg-toss-yellow", bg: "bg-orange-50" },
  누락: { icon: "📋", label: "누락", dot: "bg-toss-blue", bg: "bg-blue-50" },
};

export interface Violation {
  severity: Severity;
  rule: string;
  rule_tag: string;
  item: string;
  detail: string;
}

export interface ReceiptData {
  amount: number | null;
  date: string | null;
  vendor: string;
  category: string;
  payment_method: string;
  evidence_type: string;
  ride_datetime: string;
  origin: string;
  destination: string;
}

export interface VerifyResult {
  verdict: "PASS" | "FAIL" | "REVIEW";
  receipt: ReceiptData;
  violations: Violation[];
  counts: Record<Severity, number>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type Message =
  | { id: string; kind: "text"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "receipt"; role: "assistant"; result: VerifyResult }
  | { id: string; kind: "image"; role: "user"; url: string; name: string }
  | { id: string; kind: "error"; role: "assistant"; content: string; retry: { text: string; file: File | null } };

/** 판정(verdict) 표시 메타 — ReceiptSheet·관리자 페이지 공유. */
export const VERDICT_META: Record<VerifyResult["verdict"], { bg: string; ink: string; icon: string; title: string }> = {
  PASS: { bg: "bg-blue-50", ink: "text-toss-blue", icon: "✅", title: "PASS" },
  FAIL: { bg: "bg-red-50", ink: "text-toss-red", icon: "❌", title: "FAIL" },
  REVIEW: { bg: "bg-orange-50", ink: "text-toss-yellow", icon: "🔎", title: "검증 불가" },
};

// ── 관리자 결재 리스트 ──────────────────────────────────────────
export type SubmissionKind = "receipt" | "report";
export type SubmissionStatus = "pending" | "approved" | "rejected";

/** 관리자 결재 상태 표시 메타 (라벨·배지 색상). */
export const STATUS_META: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-toss-bg text-toss-gray" },
  approved: { label: "승인", cls: "bg-blue-50 text-toss-blue" },
  rejected: { label: "반려", cls: "bg-red-50 text-toss-red" },
};

/** 결재 리스트 행(payload 제외). */
export interface Submission {
  id: number;
  created_at: string;
  kind: SubmissionKind;
  verdict: VerifyResult["verdict"];
  summary: string;
  amount: number | null;
  status: SubmissionStatus;
  memo: string;
  decided_at: string | null;
}

/** 결의서 제출 payload(서버 저장 형태). */
export interface ReportPayload {
  input: string;
  report: { items?: unknown[]; approval_date?: string | null; spend_date?: string | null };
  violations: Violation[];
}

/** 상세 — receipt면 payload=VerifyResult, report면 payload=ReportPayload. */
export interface SubmissionDetail extends Submission {
  payload: VerifyResult | ReportPayload | null;
}
