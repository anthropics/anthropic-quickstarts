import type {
  BetaManagedAgentsTextBlock,
  BetaManagedAgentsUserCustomToolResultEventParams,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { client } from "@/lib/anthropic";
import { CUSTOM_TOOL_ACK_TEXT } from "@/lib/managed-agents/events";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// POST /api/sessions/[id]/tool-results
//   { custom_tool_use_id, text?, is_error? }
//
// The client executes custom tools. For show_chart the "execution" is just
// rendering the chart in the transcript, so the browser posts this the moment
// the tool card mounts, and the agent gets back a plain confirmation string.
// This is user.custom_tool_result keyed by custom_tool_use_id: never a
// user.tool_confirmation, which is for built-in tools and 400s on a custom id.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError(415, "expected application/json");
  }
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  const body = (await request.json().catch(() => null)) as {
    custom_tool_use_id?: unknown;
    text?: unknown;
    is_error?: unknown;
  } | null;
  if (typeof body?.custom_tool_use_id !== "string") {
    return jsonError(400, "custom_tool_use_id is required");
  }

  const text = typeof body.text === "string" && body.text ? body.text.slice(0, 4000) : CUSTOM_TOOL_ACK_TEXT;
  const content: BetaManagedAgentsTextBlock[] = [{ type: "text", text }];
  const event: BetaManagedAgentsUserCustomToolResultEventParams = {
    type: "user.custom_tool_result",
    custom_tool_use_id: body.custom_tool_use_id,
    content,
    is_error: body.is_error === true,
  };

  await client.beta.sessions.events.send(id, { events: [event] });
  return Response.json({ ok: true });
}
