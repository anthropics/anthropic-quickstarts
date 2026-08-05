// Types shared by the server routes and the browser reducer. These are pure
// type re-exports (erased at build time), so importing them client-side pulls
// none of the SDK into the bundle.
import type {
  BetaManagedAgentsSessionEvent,
  BetaManagedAgentsStreamSessionEvents,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";

/** Any event that can be persisted in a session's history (has an id). */
export type SessionEvent = BetaManagedAgentsSessionEvent;

/** Anything that can arrive on the live stream: persisted events plus the
 *  token-preview pair (event_start / event_delta), which are never persisted. */
export type StreamEvent = BetaManagedAgentsStreamSessionEvents;

export type ManagedAgentsSession = BetaManagedAgentsSession;

export type EventOf<T extends StreamEvent["type"]> = Extract<StreamEvent, { type: T }>;

/** Persisted events carry an id; the preview pair does not. */
export function isPersisted(event: StreamEvent): event is Extract<StreamEvent, { id: string }> {
  return event.type !== "event_start" && event.type !== "event_delta";
}

/** Events that carry a tool the agent invoked. All of them can be the target
 *  of a `requires_action` stop, and all render as tool-call parts. */
export type ToolUseEvent = EventOf<
  "agent.tool_use" | "agent.mcp_tool_use" | "agent.custom_tool_use"
>;

export function isToolUse(event: StreamEvent): event is ToolUseEvent {
  return (
    event.type === "agent.tool_use" ||
    event.type === "agent.mcp_tool_use" ||
    event.type === "agent.custom_tool_use"
  );
}

// ---------------------------------------------------------------------------
// The wire format between our server and the browser.
//
// The tail route (GET /api/sessions/[id]/stream) relays each Managed Agents
// event as one SSE `data:` line of {"event": <StreamEvent>}. Two envelope
// kinds exist only so the browser can tell "the session's stream said this"
// apart from "our relay is telling you something about itself".
// ---------------------------------------------------------------------------

export type RelayEnvelope =
  /** A Managed Agents event, passed through untouched. */
  | { kind: "event"; event: StreamEvent }
  /** The relay lost the upstream stream. The session keeps running
   *  server-side; the browser should replay history and reattach rather
   *  than treat this as a failed turn. */
  | { kind: "relay_error"; message: string };

/** Row shape the sidebar and history endpoints hand the browser. */
export type SessionSummary = Pick<
  ManagedAgentsSession,
  "id" | "title" | "status" | "created_at" | "updated_at" | "archived_at"
>;

/** A file that belongs to one session (an upload we mounted, or a
 *  deliverable the agent wrote to /mnt/session/outputs/). */
export type SessionFile = {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  downloadable: boolean;
  created_at: string;
};

export const CUSTOM_TOOL_ACK_TEXT = "Rendered to the user in the chat.";

export type AttachedFileRef = { filename: string; mountPath: string };

/** The note appended to a user message telling the agent where uploads
 *  landed in the sandbox. Shared by the messages route and the browser's
 *  optimistic bubble so both render byte-identical text (the reducer
 *  reconciles the echo against the bubble by its opening). */
export function attachmentNote(files: readonly AttachedFileRef[]): string {
  if (files.length === 0) return "";
  const noun =
    files.length === 1
      ? "file, mounted read-only in the sandbox"
      : "files, mounted read-only in the sandbox";
  const lines = files.map((f) => `- ${f.filename} → ${f.mountPath}`);
  return `\n\n[Attached ${noun}:\n${lines.join("\n")}]`;
}

/** The full user-message text as it will be sent (and echoed back). */
export function messageText(text: string, files: readonly AttachedFileRef[]): string {
  return (text || "Take a look at the attached data.") + attachmentNote(files);
}
