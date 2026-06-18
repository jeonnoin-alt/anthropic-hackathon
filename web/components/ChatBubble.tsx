"use client";

import { motion } from "framer-motion";

export default function ChatBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.8 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[78%] px-5 py-3.5 text-[16px] leading-relaxed shadow-toss ${
          isUser ? "whitespace-pre-wrap" : ""
        } ${
          isUser
            ? "bg-toss-blue text-white rounded-4xl rounded-tr-lg"
            : "bg-toss-card text-toss-ink rounded-4xl rounded-tl-lg"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}
