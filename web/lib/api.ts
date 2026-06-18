import type { ChatTurn, VerifyResult } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function streamChat(
  messages: ChatTurn[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`chat: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onToken(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function verifyReceipt(file: File): Promise<VerifyResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/api/verify-receipt`, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`verify-receipt: ${body?.detail ?? res.status}`);
  }
  return res.json();
}
