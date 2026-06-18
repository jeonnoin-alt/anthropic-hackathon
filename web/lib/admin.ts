import type { Submission, SubmissionDetail, SubmissionStatus } from "./types";

// lib/api.ts와 동일 규약: 기본은 같은 origin(상대경로), 분리 배포 시 환경변수로 오버라이드.
// 관리자 인증은 쿠키 기반이므로 모든 요청에 credentials를 포함한다.
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function detail(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? String(res.status);
}

/** 현재 세션이 관리자 인증 상태인지. (미인증이어도 200 → false) */
export async function adminMe(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/admin/me`, { credentials: "include" });
    return res.ok && (await res.json()).authenticated === true;
  } catch {
    return false;
  }
}

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch(`${API}/api/admin/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await detail(res));
}

export async function adminLogout(): Promise<void> {
  await fetch(`${API}/api/admin/logout`, { method: "POST", credentials: "include" });
}

export async function listSubmissions(
  filters: { status?: string; kind?: string; verdict?: string } = {},
): Promise<Submission[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const res = await fetch(`${API}/api/admin/submissions?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}

export async function getSubmission(id: number): Promise<SubmissionDetail> {
  const res = await fetch(`${API}/api/admin/submissions/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}

export async function updateSubmission(
  id: number,
  patch: { status?: SubmissionStatus; memo?: string },
): Promise<SubmissionDetail> {
  const res = await fetch(`${API}/api/admin/submissions/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}
