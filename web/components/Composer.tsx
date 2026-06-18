"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue";

export interface ComposerHandle {
  openFilePicker: () => void;
}

interface ComposerProps {
  disabled?: boolean;
  onSend: (text: string, file: File | null) => void;
  onStop?: () => void;
}

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { disabled, onSend, onStop },
  ref,
) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({ openFilePicker: () => fileRef.current?.click() }), []);

  function pick(f: File | null) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  }

  function send() {
    if (disabled || (!text.trim() && !file)) return;
    onSend(text.trim(), file);
    setText("");
    pick(null);
    if (taRef.current) taRef.current.style.height = "auto";
  }

  return (
    <div className="px-4 pb-safe pt-2 bg-toss-bg">
      <div className="mx-auto w-full max-w-3xl">
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-2 ml-2 inline-flex items-center gap-2 bg-white rounded-2xl shadow-toss p-1.5 pr-3 w-fit"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="첨부한 영수증 미리보기" className="w-10 h-10 rounded-xl object-cover" />
              <span className="text-[13px] text-toss-gray">영수증 첨부됨</span>
              <button
                onClick={() => pick(null)}
                aria-label="첨부 제거"
                className={`ml-1 w-5 h-5 rounded-full bg-toss-bg text-toss-gray text-[13px] leading-none ${focusRing}`}
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 bg-white rounded-4xl shadow-toss px-3 py-2">
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="첨부"
            className={`shrink-0 w-11 h-11 rounded-full bg-toss-bg text-[22px] text-toss-gray active:scale-90 transition-transform ${focusRing}`}
          >
            ＋
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />

          <textarea
            ref={taRef}
            rows={1}
            value={text}
            aria-label="메시지 입력"
            title="Enter 전송 · Shift+Enter 줄바꿈"
            placeholder={file ? "영수증에 대해 물어보세요 (예: 확인해줘)" : "메시지 입력 또는 영수증 첨부"}
            onChange={(e) => setText(e.target.value)}
            onInput={(e) => {
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-toss-gray max-h-32"
          />

          {disabled ? (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onStop}
              aria-label="생성 중지"
              className={`shrink-0 w-11 h-11 rounded-full bg-toss-ink text-white flex items-center justify-center ${focusRing}`}
            >
              <span className="block w-3 h-3 rounded-[3px] bg-white" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={send}
              disabled={!text.trim() && !file}
              aria-label="전송"
              className={`shrink-0 w-11 h-11 rounded-full bg-toss-blue text-white text-[20px] disabled:opacity-30 transition-opacity ${focusRing}`}
            >
              ↑
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
});

export default Composer;
