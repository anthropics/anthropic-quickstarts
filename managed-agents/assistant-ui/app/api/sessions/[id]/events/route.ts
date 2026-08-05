import { client } from "@/lib/anthropic";
import type { SessionEvent } from "@/lib/managed-agents/events";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// GET /api/sessions/[id]/events → { events, session }
//
// The full transcript, rebuilt from the session's own event log. Nothing is
// stored server-side, so nothing can be stale: opening an old chat replays
// exactly what happened, tool calls and approvals included. The browser runs
// these through the same reducer it uses for live events.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id, { allowArchived: true });
  if (!session) return jsonError(404, "session not found");

  const events: SessionEvent[] = [];
  // Chronological order; the SDK follows next_page across pages for us.
  for await (const event of client.beta.sessions.events.list(id, { order: "asc" })) {
    events.push(event);
  }

  return Response.json({
    events,
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      archived_at: session.archived_at,
    },
  });
}
