"use client";

// Thin fetch wrappers around our own route handlers. The browser never
// talks to Managed Agents directly (the API key lives server-side); this is
// the whole surface it uses, minus the live tail (session-controller.ts).

import type { SessionFile, SessionSummary } from "./events";

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = `${what} (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function listSessions(after?: string): Promise<{
  sessions: SessionSummary[];
  nextCursor: string | null;
}> {
  const url = after ? `/api/sessions?after=${encodeURIComponent(after)}` : "/api/sessions";
  return json(await fetch(url, { cache: "no-store" }), "list sessions");
}

export async function createSession(): Promise<SessionSummary> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return json(res, "create session");
}

export async function getSession(id: string): Promise<SessionSummary> {
  return json(await fetch(`/api/sessions/${id}`, { cache: "no-store" }), "get session");
}

export async function renameSession(id: string, title: string): Promise<void> {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await json(res, "rename session");
}

export async function archiveSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${id}/archive`, { method: "POST" });
  if (!res.ok) await json(res, "archive session");
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) await json(res, "delete session");
}

export async function listSessionFiles(id: string): Promise<SessionFile[]> {
  const body = await json<{ files: SessionFile[] }>(
    await fetch(`/api/sessions/${id}/files`, { cache: "no-store" }),
    "list files",
  );
  return body.files;
}

export function sessionFileUrl(sessionId: string, fileId: string): string {
  return `/api/sessions/${sessionId}/files/${fileId}/download`;
}

export type UploadedFile = {
  fileId: string;
  filename: string;
  mountPath: string;
  size_bytes: number;
};

export async function uploadSessionFile(sessionId: string, file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`/api/sessions/${sessionId}/files`, { method: "POST", body: form });
  return json(res, "upload file");
}
