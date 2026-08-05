import { client } from "@/lib/anthropic";
import { listSessionFiles } from "@/lib/managed-agents/session-files";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// GET /api/sessions/[id]/files/[fileId]/download
//
// Two gates before a byte moves. The session must be ours (ownedSession),
// and the file must belong to *that* session (it's in the session's own
// file set). Without the second check this route would happily stream any
// file the server's API key can see, keyed on nothing but a guessed id.

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id, fileId } = await params;
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(fileId)) return jsonError(404, "file not found");

  const files = await listSessionFiles(id);
  const meta = files.find((f) => f.id === fileId);
  if (!meta) return jsonError(404, "file not found");
  // Uploads we mounted are inputs, not downloadable through the Files API.
  if (!meta.downloadable) return jsonError(400, "file is not downloadable");

  const upstream = await client.beta.files.download(fileId);
  const filename = meta.filename.replace(/[^A-Za-z0-9._-]/g, "_") || "download";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": meta.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
