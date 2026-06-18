"use client";

import { motion } from "framer-motion";

export default function TypingDots() {
  return (
    <div
      role="status"
      aria-label="AI가 답변을 작성 중입니다"
      className="flex items-center gap-1.5 px-5 py-4 bg-toss-card rounded-4xl rounded-tl-lg shadow-toss w-fit"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2.5 h-2.5 rounded-full bg-toss-gray"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
