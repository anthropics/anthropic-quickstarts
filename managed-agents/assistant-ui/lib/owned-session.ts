import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import { Anthropic, SESSION_METADATA, agentId, client } from "@/lib/anthropic";

// Session IDs arrive from the browser (URL, request bodies) and become
// Managed Agents path parameters, and the server's key can see every session
// in the workspace, including other agents'. This is the gate every
// session-touching route goes through: the ID must look like an ID, resolve,
// belong to this quickstart's agent, carry our metadata tag, and be alive.
// Returns the session, or null for "not yours / doesn't exist".
export async function ownedSession(
  sessionId: string,
  { allowArchived = false }: { allowArchived?: boolean } = {},
): Promise<BetaManagedAgentsSession | null> {
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(sessionId)) return null;

  let session: BetaManagedAgentsSession;
  try {
    session = await client.beta.sessions.retrieve(sessionId);
  } catch (err) {
    // Only a definitive rejection means the session is gone. A 429 or 5xx
    // must not read as "not yours", or a rate limit turns into a wall of 404s.
    if (
      err instanceof Anthropic.APIError &&
      (err.status === 400 || err.status === 404 || err.status === 410)
    ) {
      return null;
    }
    throw err;
  }

  if (session.agent.id !== agentId()) return null;
  if (session.metadata?.quickstart !== SESSION_METADATA.quickstart) return null;
  if (!allowArchived && session.archived_at != null) return null;
  return session;
}

// The API refuses destructive calls (delete, archive) on a running session,
// and user.interrupt only ENQUEUES the stop — the turn winds down
// asynchronously. So "interrupt then immediately delete" races: the delete
// can land while the session is still running and throw. Interrupt, then
// wait (bounded) for the session to actually leave "running".
export async function stopIfRunning(session: BetaManagedAgentsSession): Promise<void> {
  if (session.status !== "running") return;
  await client.beta.sessions.events
    .send(session.id, { events: [{ type: "user.interrupt" }] })
    .catch(() => {});
  // Poll first, sleep after: a turn that winds down instantly shouldn't
  // cost the caller a flat 500ms.
  for (let i = 0; i < 10; i++) {
    try {
      const current = await client.beta.sessions.retrieve(session.id);
      if (current.status !== "running") return;
    } catch (err) {
      // Only a definitive rejection means the session is gone; a 429/5xx is
      // transient — keep waiting rather than declaring victory early.
      if (
        err instanceof Anthropic.APIError &&
        (err.status === 400 || err.status === 404 || err.status === 410)
      ) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Still running after ~5s: let the destructive call surface the conflict.
}
