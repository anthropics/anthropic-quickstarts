import { toFile } from "@anthropic-ai/sdk";
import path from "node:path";
import { client } from "@/lib/anthropic";
import type { SessionFile } from "@/lib/managed-agents/events";

// Files are never addressable outside a session. Both directions go through
// the session's own file set:
//   - uploads land as read-only mounts (session resources) → resources.list
//   - deliverables the agent writes to /mnt/session/outputs/ are file records
//     scoped to the session → files.list({scope_id})
// The download route checks a fileId against this set before streaming a
// byte, so the org-wide API key can't be used to read another session's
// (or another agent's) files by guessing an id.

export const UPLOAD_MAX_BYTES = 30 * 1024 * 1024; // 30 MB is plenty for a demo CSV

// Extensions the analyst persona can actually use. Blocking the rest keeps a
// stray .exe or huge video out of the sandbox and out of our Files quota.
const ALLOWED_EXTENSIONS = new Set([
  ".csv", ".tsv", ".xlsx", ".xls", ".json", ".txt", ".md", ".pdf",
]);

export function validateUpload(filename: string, size: number): string | null {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `unsupported file type ${ext || "(none)"}; try csv, xlsx, json, txt, md, pdf`;
  }
  if (size > UPLOAD_MAX_BYTES) {
    return `file too large (max ${UPLOAD_MAX_BYTES / 1024 / 1024} MB)`;
  }
  return null;
}

/** Absolute sandbox path a session upload gets mounted at. `mount_path` on
 *  resources.add IS the full in-container path (its default is
 *  /mnt/session/uploads/<file_id>), so this exact string is both what we
 *  mount and what we tell the agent — the two must never differ. The file
 *  id keeps the path unique (two `sales.csv` uploads — or a corrected copy
 *  of the same file — must not claim one path); the readable basename stays
 *  as the leaf so the agent and the chat note still show the real name. */
export function mountPathFor(fileId: string, filename: string): string {
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_") || "upload";
  return `/mnt/session/uploads/${fileId}/${base}`;
}

/** Upload a browser-provided File to the Files API and mount it into the
 *  session sandbox. Returns the file id and where the agent will find it. */
export async function uploadAndMount(sessionId: string, file: File) {
  const uploaded = await client.beta.files.upload({
    file: await toFile(file, file.name, { type: file.type || "application/octet-stream" }),
  });
  const mountPath = mountPathFor(uploaded.id, file.name);
  await client.beta.sessions.resources.add(sessionId, {
    type: "file",
    file_id: uploaded.id,
    mount_path: mountPath,
  });
  return {
    fileId: uploaded.id,
    filename: uploaded.filename,
    mountPath,
    size_bytes: uploaded.size_bytes,
  };
}

/** Every file that belongs to this session: what we mounted plus what the
 *  agent produced. The membership check for downloads is built on this. */
export async function listSessionFiles(sessionId: string): Promise<SessionFile[]> {
  const byId = new Map<string, SessionFile>();

  // Agent-produced outputs (and, on some backends, uploads too) are file
  // records scoped to the session.
  try {
    for await (const file of client.beta.files.list({ scope_id: sessionId })) {
      byId.set(file.id, {
        id: file.id,
        filename: file.filename,
        size_bytes: file.size_bytes,
        mime_type: file.mime_type,
        downloadable: file.downloadable ?? false,
        created_at: file.created_at,
      });
    }
  } catch {
    // scope_id filtering may not be enabled everywhere yet; the resources
    // list below still gives us the uploads. Downloads of anything not in
    // the set simply stay refused, which is the safe default.
  }

  // Our own mounted uploads. These are inputs (not downloadable), but they
  // belong to the session, so record them for a complete file set.
  for await (const resource of client.beta.sessions.resources.list(sessionId)) {
    if (resource.type !== "file" || byId.has(resource.file_id)) continue;
    byId.set(resource.file_id, {
      id: resource.file_id,
      filename: resource.mount_path.split("/").pop() || resource.file_id,
      size_bytes: 0,
      mime_type: "application/octet-stream",
      downloadable: false,
      created_at: resource.created_at,
    });
  }

  return [...byId.values()];
}
