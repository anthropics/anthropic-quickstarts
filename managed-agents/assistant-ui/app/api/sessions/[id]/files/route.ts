import { listSessionFiles, uploadAndMount, validateUpload } from "@/lib/managed-agents/session-files";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// GET  /api/sessions/[id]/files             → { files } (uploads + agent outputs)
// POST /api/sessions/[id]/files (multipart)  → upload one file, mount into sandbox
//
// The composer's attachment adapter creates the session first (so an id
// exists), then posts each file here. We push it to the Anthropic Files API
// and mount it read-only into the session sandbox in one step; the agent
// reads it with its file tools. There is deliberately no session-less
// /api/files: every file lives inside a session this app owns.

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");
  const files = await listSessionFiles(id);
  return Response.json({ files });
}

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return jsonError(415, "expected multipart/form-data");
  }
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "missing file field");

  const invalid = validateUpload(file.name, file.size);
  if (invalid) return jsonError(400, invalid);

  const attached = await uploadAndMount(id, file);
  return Response.json(attached, { status: 201 });
}
