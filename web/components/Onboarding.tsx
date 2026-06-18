"use client";

import { motion } from "framer-motion";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue";

const CATEGORIES = [
  { key: "meal", icon: "🍚", tile: "bg-[#fff4e6]", label: "식대", sub: "점심·저녁·야근", q: "점심 식대 한도가 궁금해요" },
  { key: "transit", icon: "🚕", tile: "bg-[#e8f3ff]", label: "교통", sub: "택시·야근 이동", q: "야근 택시비 규정 알려주세요" },
  { key: "entertain", icon: "🤝", tile: "bg-[#fdeef0]", label: "접대", sub: "청탁금지법 한도", q: "접대비 한도가 궁금해요" },
  { key: "trip", icon: "✈️", tile: "bg-[#eafaf1]", label: "출장", sub: "정산·승인 절차", q: "출장비 정산 절차가 궁금해요" },
] as const;

export default function Onboarding({
  onAsk,
  onAttach,
}: {
  onAsk: (q: string) => void;
  onAttach: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="flex-1 flex flex-col justify-center px-1 pb-5"
    >
      <h2 className="text-[21px] font-extrabold tracking-tight">무엇을 검증할까요?</h2>
      <p className="text-[13px] text-toss-gray mt-1 mb-[18px]">카테고리를 고르면 규정을 안내해 드려요.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => onAsk(c.q)}
            className={`flex flex-col gap-2.5 rounded-3xl bg-white p-4 text-left shadow-toss active:scale-[0.97] transition-transform ${focusRing}`}
          >
            <span className={`flex items-center justify-center w-10 h-10 rounded-xl text-[20px] ${c.tile}`}>
              {c.icon}
            </span>
            <span>
              <span className="block text-[15px] font-bold text-toss-ink">{c.label}</span>
              <span className="block text-[12px] text-toss-gray mt-0.5">{c.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={onAttach}
        className={`mt-[11px] flex items-center gap-3 w-full rounded-3xl bg-toss-blue px-4 py-[17px] text-left shadow-[0_8px_22px_rgba(49,130,246,0.26)] active:scale-[0.98] transition-transform ${focusRing}`}
      >
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 text-[20px]">🧾</span>
        <span className="flex-1">
          <span className="block text-[15.5px] font-extrabold text-white">영수증 바로 검증하기</span>
          <span className="block text-[12.5px] text-white/80 mt-0.5">이미지를 첨부하면 즉시 판정</span>
        </span>
        <span className="text-[20px] text-white/85">›</span>
      </button>
    </motion.div>
  );
}
