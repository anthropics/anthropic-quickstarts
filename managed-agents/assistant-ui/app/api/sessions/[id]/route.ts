import { Anthropic, client } from "@/lib/anthropic";
import type { SessionSummary } from "@/lib/managed-agents/events";
import { ownedSession, stopIfRunning } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// One session's metadata, retitle, and delete.
//
// GET    /api/sessions/[id]          → summary
// PATCH  /api/sessions/[id] {title}  → retitled summary
// DELETE /api/sessions/[id]          → hard delete (record + history + sandbox)

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");
  const summary: SessionSummary = {
    id: session.id,
    title: session.title,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    archived_at: session.archived_at,
  };
  return Response.json(summary);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError(415, "expected application/json");
  }
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return jsonError(400, "title is required");

  const updated = await client.beta.sessions.update(id, { title });
  return Response.json({ id: updated.id, title: updated.title });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");

  // The API refuses to delete a running session; interrupt and wait for the
  // turn to wind down so "delete" in the sidebar works on a busy chat too.
  await stopIfRunning(session);
  try {
    await client.beta.sessions.delete(id);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Already gone (raced another tab): the outcome the caller wanted.
      if (err.status === 404 || err.status === 410) return new Response(null, { status: 204 });
      // Still winding down: retryable. Anything else is a real failure.
      if (err.status === 400 || err.status === 409) {
        return jsonError(409, "the session is still winding down; try again in a moment");
      }
    }
    throw err;
  }
  return new Response(null, { status: 204 });
}
