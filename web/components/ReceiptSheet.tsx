"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SEVERITY_META, type VerifyResult } from "@/lib/types";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-toss-bg rounded-3xl px-4 py-3">
      <div className="text-[13px] text-toss-gray mb-0.5">{label}</div>
      <div className="text-[17px] font-bold text-toss-ink truncate">{value}</div>
    </div>
  );
}

const VSTYLE = {
  PASS: { bg: "bg-blue-50", ink: "text-toss-blue", icon: "✅", title: "PASS" },
  FAIL: { bg: "bg-red-50", ink: "text-toss-red", icon: "❌", title: "FAIL" },
  REVIEW: { bg: "bg-orange-50", ink: "text-toss-yellow", icon: "🔎", title: "검증 불가" },
} as const;

export default function ReceiptSheet({
  result,
  onClose,
}: {
  result: VerifyResult | null;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (result) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => sheetRef.current?.focus());
    } else {
      prevFocus.current?.focus?.();
    }
  }, [result]);

  const verdict = result?.verdict ?? "PASS";
  const vstyle = VSTYLE[verdict];
  const subtitle =
    verdict === "PASS"
      ? "회사 룰 충족"
      : verdict === "REVIEW"
        ? "영수증을 판독하지 못했어요 · 다시 첨부해 주세요"
        : `위반 ${result?.violations.length ?? 0}건`;
  const r = result?.receipt;
  const isTaxi = !!(r?.ride_datetime || r?.origin);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const root = sheetRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <AnimatePresence>
      {result && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="영수증 검증 결과"
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="fixed left-1/2 bottom-0 z-50 w-full max-w-3xl -translate-x-1/2 bg-white rounded-t-4xl shadow-sheet px-6 pt-3 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar focus:outline-none"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
          >
            <div className="mx-auto mb-5 mt-1 h-1.5 w-12 rounded-full bg-toss-line" />

            <div className={`rounded-4xl px-6 py-6 mb-5 text-center ${vstyle.bg}`}>
              <div className="text-[40px] mb-1">{vstyle.icon}</div>
              <div className={`text-[24px] font-extrabold ${vstyle.ink}`}>{vstyle.title}</div>
              <div className="text-[14px] text-toss-gray mt-1">{subtitle}</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <Metric label="금액" value={r?.amount ? `₩${r.amount.toLocaleString()}` : "—"} />
              <Metric label="결제수단" value={r?.payment_method || "—"} />
              <Metric label="업종" value={r?.category || "—"} />
              <Metric label="증빙" value={r?.evidence_type || "—"} />
            </div>

            {isTaxi && (
              <div className="bg-toss-bg rounded-3xl px-4 py-3 mb-5 text-[15px] text-toss-ink">
                🚕 <b>{r?.origin || "—"}</b> → <b>{r?.destination || "—"}</b>
                <span className="text-toss-gray"> · 🕐 {r?.ride_datetime || "—"}</span>
              </div>
            )}

            {result.violations.length > 0 && (
              <div className="space-y-2.5">
                {result.violations.map((v, i) => {
                  const s = SEVERITY_META[v.severity];
                  return (
                    <motion.div
                      key={`${v.rule}-${v.item}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 400, damping: 30 }}
                      className={`rounded-3xl px-5 py-4 ${s.bg}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        <span className="text-[13px] font-semibold text-toss-gray">
                          {s.icon} {s.label} · {v.rule} · {v.rule_tag}
                        </span>
                      </div>
                      <div className="text-[16px] font-bold text-toss-ink">{v.item}</div>
                      <div className="text-[14px] text-toss-gray mt-0.5 leading-relaxed">{v.detail}</div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-6 w-full rounded-3xl bg-toss-blue py-4 text-[17px] font-bold text-white active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue focus-visible:ring-offset-2"
            >
              확인
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
