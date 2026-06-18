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
