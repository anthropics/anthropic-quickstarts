import type { BetaManagedAgentsUserMessageEventParams } from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { client } from "@/lib/anthropic";
import { messageText, type AttachedFileRef } from "@/lib/managed-agents/events";
import { ownedSession } from "@/lib/owned-session";
import { jsonError } from "@/lib/sse";

// POST /api/sessions/[id]/messages {text, files?: [{filename, mountPath}]}
//
// One user turn. The browser must already have the tail
// (/api/sessions/[id]/stream) open before calling this: the reply arrives on
// the stream, not on this response. Files were uploaded and mounted into the
// sandbox at attach time (POST /api/sessions/[id]/files); here we just tell the
// agent where they landed so it can `read` them.

type Ctx = { params: Promise<{ id: string }> };

const TITLE_MAX = 60;
const TEXT_MAX = 20_000;

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError(415, "expected application/json");
  }
  const session = await ownedSession(id);
  if (!session) return jsonError(404, "session not found");

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    files?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const files: AttachedFileRef[] = Array.isArray(body?.files)
    ? body.files.filter(
        (f): f is AttachedFileRef =>
          !!f &&
          typeof (f as AttachedFileRef).filename === "string" &&
          typeof (f as AttachedFileRef).mountPath === "string",
      )
    : [];

  if (!text && files.length === 0) return jsonError(400, "message is empty");
  if (text.length > TEXT_MAX) return jsonError(400, "message too long");

  const message: BetaManagedAgentsUserMessageEventParams = {
    type: "user.message",
    // messageText() is shared with the browser's optimistic bubble, so the
    // echoed event carries byte-identical text and reconciles cleanly.
    content: [{ type: "text", text: messageText(text, files) }],
  };

  await client.beta.sessions.events.send(id, { events: [message] });

  // The first real message names the conversation, so the sidebar and the
  // Console session list both show what it's about. An attachment-only send
  // (drop a CSV, empty text box — the app's front door) titles from the
  // filename. Fire-and-forget: a failed retitle must never fail the turn.
  if (session.title === "New chat") {
    const title = (text || files[0]?.filename || "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    if (title) {
      void client.beta.sessions.update(id, { title }).catch(() => {});
    }
  }

  return Response.json({ ok: true }, { status: 202 });
}
