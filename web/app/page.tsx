"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ChatBubble from "@/components/ChatBubble";
import Markdown from "@/components/Markdown";
import TypingDots from "@/components/TypingDots";
import Onboarding from "@/components/Onboarding";
import ReceiptSheet from "@/components/ReceiptSheet";
import Composer, { type ComposerHandle } from "@/components/Composer";
import { streamChat, verifyReceipt } from "@/lib/api";
import { SEVERITY_META, type ChatTurn, type Message, type Severity, type VerifyResult } from "@/lib/types";

const uid = () => crypto.randomUUID();
const MAX_HISTORY_TURNS = 20;

function failLabel(counts: Record<Severity, number>): string {
  const parts = (Object.keys(SEVERITY_META) as Severity[])
    .filter((s) => counts?.[s] > 0)
    .map((s) => `${SEVERITY_META[s].label} ${counts[s]}`);
  return parts.length ? `❌ FAIL · ${parts.join(" · ")}` : "❌ FAIL";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function receiptSummary(r: VerifyResult): string {
  const c = r.receipt;
  const lines = [
    "[방금 첨부한 영수증 판독 결과]",
    `- 금액: ₩${(c.amount ?? 0).toLocaleString()}`,
    `- 지출일: ${c.date || "—"}`,
    `- 결제수단: ${c.payment_method || "—"} / 증빙: ${c.evidence_type || "—"} / 업종: ${c.category || "—"}`,
  ];
  if (c.ride_datetime || c.origin) {
    lines.push(`- 택시: ${c.origin || "—"} → ${c.destination || "—"} · ${c.ride_datetime || "—"}`);
  }
  lines.push(`- 규칙 검증 판정: ${r.verdict}`);
  lines.push(
    r.violations.length
      ? `- 위반: ${r.violations.map((v) => `${v.rule} ${v.item}`).join("; ")}`
      : "- 위반 없음",
  );
  return lines.join("\n");
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sheet, setSheet] = useState<VerifyResult | null>(null);
  const [live, setLive] = useState("");

  const historyRef = useRef<ChatTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function callChat(userContent: string) {
    const turns: ChatTurn[] = [...historyRef.current, { role: "user", content: userContent }];
    const aid = uid();
    let acc = "";
    let started = false;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    await streamChat(
      turns,
      (tok) => {
        acc += tok;
        if (!started) {
          started = true;
          setMessages((p) => [...p, { id: aid, kind: "text", role: "assistant", content: acc }]);
        } else {
          setMessages((p) =>
            p.map((m) => (m.id === aid && m.kind === "text" ? { ...m, content: acc } : m)),
          );
        }
      },
      ac.signal,
    );

    historyRef.current = [...turns, { role: "assistant" as const, content: acc }].slice(-MAX_HISTORY_TURNS);
    setLive(acc);
  }

  async function handleSubmit(text: string, file: File | null, isRetry = false) {
    if (!isRetry) {
      if (file) {
        const url = await fileToDataUrl(file);
        setMessages((p) => [...p, { id: uid(), kind: "image", role: "user", url, name: file.name }]);
      }
      if (text) {
        setMessages((p) => [...p, { id: uid(), kind: "text", role: "user", content: text }]);
      }
    }

    setBusy(true);
    try {
      if (file) {
        let result: VerifyResult;
        setVerifying(true);
        try {
          result = await verifyReceipt(file);
        } finally {
          setVerifying(false);
        }
        setMessages((p) => [...p, { id: uid(), kind: "receipt", role: "assistant", result }]);
        setSheet(result);

        const summary = receiptSummary(result);
        if (text) {
          await callChat(`${summary}\n\n사용자 질문: ${text}`);
        } else if (result.verdict === "REVIEW") {
          await callChat(
            `${summary}\n\n영수증을 판독하지 못했습니다. 사용자에게 금액·상호가 보이도록 다시 첨부해 달라고 짧고 친절하게 안내해줘.`,
          );
        } else {
          const next = [
            ...historyRef.current,
            { role: "user" as const, content: summary },
            {
              role: "assistant" as const,
              content: `영수증 검증 완료: ${result.verdict}${
                result.violations.length ? ` (위반 ${result.violations.length}건)` : " (위반 없음)"
              }. 추가로 궁금한 점을 물어보세요.`,
            },
          ];
          historyRef.current = next.slice(-MAX_HISTORY_TURNS);
        }
      } else if (text) {
        await callChat(text);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "";
      const content = msg.startsWith("verify-receipt")
        ? "⚠️ 영수증을 인식하지 못했어요. 이미지(금액·상호가 보이도록)를 다시 첨부해 주세요."
        : msg.startsWith("chat")
          ? "⚠️ AI 응답에 실패했어요. 잠시 후 다시 시도해 주세요."
          : "⚠️ 서버에 연결하지 못했어요. 백엔드(:8000)·API 키를 확인해 주세요.";
      setMessages((p) => [
        ...p,
        { id: uid(), kind: "error", role: "assistant", content, retry: { text, file } },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function goHome() {
    abortRef.current?.abort();
    setBusy(false);
    setVerifying(false);
    setMessages([]);
    historyRef.current = [];
    setSheet(null);
    setLive("");
  }

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="bg-toss-bg">
        <div className="mx-auto w-full max-w-3xl flex items-center gap-2.5 px-5 pt-3 pb-3.5">
          <button
            type="button"
            aria-label="SpendSentry · 처음 화면으로"
            onClick={goHome}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue rounded-xl"
          >
            <div className="flex shrink-0 items-center justify-center w-[38px] h-[38px] rounded-xl bg-[#e8f3ff] text-[20px]">
              🧾
            </div>
            <div className="min-w-0">
              <span className="block text-[17px] font-extrabold tracking-tight leading-tight">SpendSentry</span>
              <div className="text-[12px] text-toss-gray mt-px">Sentri AI 컴플라이언스</div>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[12px] font-bold text-toss-gray">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16c47f]" />
            온라인
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar">
        <div className="mx-auto w-full max-w-3xl min-h-full px-4 py-3 flex flex-col gap-3">
          {messages.length === 0 && !busy && (
            <Onboarding
              onAsk={(q) => handleSubmit(q, null)}
              onAttach={() => composerRef.current?.openFilePicker()}
            />
          )}

          {messages.map((m) => {
            if (m.kind === "text") {
              return (
                <ChatBubble key={m.id} role={m.role}>
                  {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
                </ChatBubble>
              );
            }
            if (m.kind === "error") {
              return (
                <ChatBubble key={m.id} role="assistant">
                  <div className="text-toss-ink">{m.content}</div>
                  <button
                    onClick={() => handleSubmit(m.retry.text, m.retry.file, true)}
                    disabled={busy}
                    className="mt-2 rounded-2xl bg-toss-bg px-4 py-2 text-[14px] font-bold text-toss-blue active:scale-95 transition-transform disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue"
                  >
                    다시 시도
                  </button>
                </ChatBubble>
              );
            }
            if (m.kind === "image") {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="flex justify-end"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="첨부한 영수증 이미지" className="max-w-[60%] rounded-4xl shadow-toss" />
                </motion.div>
              );
            }
            // kind === "receipt"
            const chip =
              m.result.verdict === "PASS"
                ? { ink: "text-toss-blue", label: "✅ PASS" }
                : m.result.verdict === "REVIEW"
                  ? { ink: "text-toss-yellow", label: "🔎 검증 불가" }
                  : { ink: "text-toss-red", label: failLabel(m.result.counts) };
            return (
              <ChatBubble key={m.id} role="assistant">
                <button
                  onClick={() => setSheet(m.result)}
                  aria-label="영수증 검증 상세 보기"
                  className="text-left w-full cursor-pointer rounded-2xl hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toss-blue"
                >
                  <div className={`text-[18px] font-extrabold ${chip.ink}`}>{chip.label}</div>
                  <div className="text-[14px] text-toss-gray mt-0.5">
                    ₩{(m.result.receipt.amount ?? 0).toLocaleString()} · {m.result.receipt.payment_method || "—"} ·
                    탭하여 상세
                  </div>
                </button>
              </ChatBubble>
            );
          })}

          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {verifying ? (
                  <div
                    role="status"
                    aria-label="영수증을 판독하는 중입니다"
                    className="bg-toss-card rounded-4xl rounded-tl-lg shadow-toss px-5 py-4 w-fit"
                  >
                    <div className="skeleton h-5 w-24 rounded-lg mb-2" />
                    <div className="skeleton h-3.5 w-40 rounded" />
                  </div>
                ) : (
                  <TypingDots />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {live}
      </div>

      <Composer ref={composerRef} disabled={busy} onSend={handleSubmit} onStop={stop} />
      <ReceiptSheet result={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
