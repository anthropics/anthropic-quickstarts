import { SESSION_METADATA, agentId, client, environmentId } from "@/lib/anthropic";
import type { ManagedAgentsSession, SessionSummary } from "@/lib/managed-agents/events";
import { jsonError } from "@/lib/sse";

// The sidebar's data source. There is no conversations table: the thread
// list *is* the Managed Agents session list for this agent, filtered to the
// sessions this quickstart created (metadata tag).
//
// GET  /api/sessions?after=<cursor>&archived=1  → { sessions, nextCursor }
// POST /api/sessions                              → new session summary

const PAGE_SIZE = 30;
// The filters below run client-side, so a whole API page can filter down to
// nothing (a run of terminated sessions, say) while older live sessions sit
// on later pages — and an empty sidebar has no scroll to advance the cursor.
// Keep paging until there are rows to show, bounded per request.
const MAX_PAGES = 5;

function summarize(session: ManagedAgentsSession): SessionSummary {
  const { id, title, status, created_at, updated_at, archived_at } = session;
  return { id, title, status, created_at, updated_at, archived_at };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? undefined;
  const archived = url.searchParams.get("archived") === "1";

  const sessions: SessionSummary[] = [];
  let cursor = after;
  let nextCursor: string | null = null;
  for (let i = 0; i < MAX_PAGES && sessions.length < PAGE_SIZE; i++) {
    const page = await client.beta.sessions.list({
      agent_id: agentId(),
      limit: PAGE_SIZE,
      order: "desc",
      include_archived: archived,
      ...(cursor ? { page: cursor } : {}),
    });
    for (const s of page.data) {
      if (s.metadata?.quickstart !== SESSION_METADATA.quickstart) continue;
      // A terminated session can't be resumed; showing it would be a dead row.
      if (s.status === "terminated") continue;
      if (archived !== (s.archived_at != null)) continue;
      sessions.push(summarize(s));
    }
    nextCursor = page.next_page ?? null;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return Response.json({ sessions, nextCursor });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError(415, "expected application/json");
  }

  const session = await client.beta.sessions.create({
    agent: agentId(),
    environment_id: environmentId(),
    // Real title arrives with the first message (the runtime retitles then);
    // this keeps a just-created row from being blank.
    title: "New chat",
    metadata: { ...SESSION_METADATA },
  });

  return Response.json(summarize(session), { status: 201 });
}
