import type { BetaManagedAgentsUserToolConfirmationEventParams } from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { client } from "@/lib/anthropic";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// POST /api/sessions/[id]/confirm
//   { confirmations: [{ tool_use_id, result: "allow"|"deny", deny_message? }] }
//
// The other half of an always_ask tool. When the agent invokes bash, the
// session parks with session.status_idle{stop_reason: requires_action,
// event_ids:[...]}; the browser renders Allow/Deny on that tool's card, and
// the click lands here as a user.tool_confirmation. tool_use_id is the *event*
// id of the agent.tool_use event, straight out of stop_reason.event_ids.
//
// Confirmations are batched into ONE send: if two tools block at once, sending
// them separately races the resume transition and the second request can be
// rejected with "no thread is waiting on tool_use_id". The browser debounces
// clicks into a batch; we forward the whole batch in a single call.

type Ctx = { params: Promise<{ id: string }> };

type ConfirmationInput = {
  tool_use_id?: unknown;
  result?: unknown;
  deny_message?: unknown;
};

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError(415, "expected application/json");
  }
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  const body = (await request.json().catch(() => null)) as {
    confirmations?: ConfirmationInput[];
  } | null;
  const input = body?.confirmations;
  if (!Array.isArray(input) || input.length === 0) {
    return jsonError(400, "confirmations must be a non-empty array");
  }

  const events: BetaManagedAgentsUserToolConfirmationEventParams[] = [];
  for (const c of input) {
    if (typeof c?.tool_use_id !== "string" || (c.result !== "allow" && c.result !== "deny")) {
      return jsonError(400, "each confirmation needs tool_use_id and result 'allow'|'deny'");
    }
    const event: BetaManagedAgentsUserToolConfirmationEventParams = {
      type: "user.tool_confirmation",
      tool_use_id: c.tool_use_id,
      result: c.result,
    };
    // deny_message is only accepted alongside a deny.
    if (c.result === "deny" && typeof c.deny_message === "string" && c.deny_message.trim()) {
      event.deny_message = c.deny_message.trim().slice(0, 2000);
    }
    events.push(event);
  }

  await client.beta.sessions.events.send(id, { events });
  return Response.json({ ok: true, confirmed: events.length });
}
