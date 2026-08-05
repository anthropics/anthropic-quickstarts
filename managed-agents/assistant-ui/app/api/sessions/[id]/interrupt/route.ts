import { client } from "@/lib/anthropic";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// POST /api/sessions/[id]/interrupt
//
// The stop button. Closing the browser's stream would only abandon the
// response while the agent kept working; a user.interrupt actually cancels
// the turn server-side.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  await client.beta.sessions.events.send(id, { events: [{ type: "user.interrupt" }] });
  return Response.json({ ok: true });
}
