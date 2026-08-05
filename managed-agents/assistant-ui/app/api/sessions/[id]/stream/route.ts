import { client } from "@/lib/anthropic";
import type { RelayEnvelope, StreamEvent } from "@/lib/managed-agents/events";
import { ownedSession } from "@/lib/owned-session";
import { createSseStream, jsonError, sseResponse } from "@/lib/sse";

// GET /api/sessions/[id]/stream — the live tail.
//
// The browser opens this ONCE per open thread, *before* it posts any message,
// and keeps it open across turns (and across the pause while an always_ask
// tool waits for a click). That ordering matters: a Managed Agents stream
// only delivers events emitted after it attaches, so "post first, listen
// second" would drop the start of the turn. Everything the session emits
// (text previews, tool calls, approval stops, status) is relayed through
// as-is; the browser's reducer is the one place that interprets it.
//
// If the browser goes away, we abort the upstream stream. That abandons the
// *response*, not the turn: the session keeps working server-side and the
// reply is waiting in history when the tab comes back.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  let upstream: AsyncIterable<StreamEvent> & { controller?: AbortController };
  try {
    upstream = await client.beta.sessions.events.stream(id, {
      // Token previews: text arrives as it's written, then the buffered
      // agent.message reconciles it. Orgs without the streaming gate get no
      // previews and the same code path degrades to whole-message replies.
      event_deltas: ["agent.message", "agent.thinking"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stream open failed";
    return jsonError(502, message);
  }

  const abort = () => {
    try {
      upstream.controller?.abort();
    } catch {
      /* already gone */
    }
  };

  const { stream, writer } = createSseStream(abort);
  request.signal.addEventListener("abort", () => {
    abort();
    writer.close();
  });

  // Long turns can go quiet between events (a big bash job, a slow fetch);
  // a comment frame every 15s keeps intermediaries from reaping the socket.
  const heartbeat = setInterval(() => writer.comment("heartbeat"), HEARTBEAT_MS);

  (async () => {
    try {
      for await (const event of upstream) {
        const envelope: RelayEnvelope = { kind: "event", event };
        writer.send(envelope);
        // A deleted session ends the stream; nothing more will arrive.
        if (event.type === "session.deleted") break;
      }
    } catch (err) {
      if (!request.signal.aborted) {
        const message = err instanceof Error ? err.message : "relay dropped";
        const envelope: RelayEnvelope = { kind: "relay_error", message };
        writer.send(envelope);
      }
    } finally {
      clearInterval(heartbeat);
      writer.close();
    }
  })();

  return sseResponse(stream);
}
