import { Anthropic, client } from "@/lib/anthropic";
import { ownedSession, stopIfRunning } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// POST /api/sessions/[id]/archive {archived: boolean}
//
// Archiving keeps the record and its history but drops the session from the
// default listing and blocks new events. Managed Agents has no unarchive, so
// "unarchive" is not offered by the sidebar.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  // A running session can't be archived: stop the turn and wait for the
  // session to actually leave "running" before the archive call.
  await stopIfRunning(session);
  try {
    await client.beta.sessions.archive(id);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Deleted meanwhile: nothing left to archive, treat as done.
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
