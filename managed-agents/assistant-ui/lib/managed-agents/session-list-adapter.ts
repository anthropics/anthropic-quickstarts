"use client";

// The sidebar is not backed by a database. It's a RemoteThreadListAdapter
// over the Managed Agents session list: each thread IS a session, and the
// thread id assistant-ui hands us (remoteId/externalId) is the session id.
//
//   list        → sessions.list (this quickstart's sessions, newest first)
//   initialize  → sessions.create   (fires on the first message of a new chat)
//   rename      → sessions.update title
//   archive     → sessions.archive
//   delete      → sessions.delete
//   generateTitle → the server retitles from the first message; we surface
//                   the resulting title so the sidebar row updates in place

import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import {
  archiveSession,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  renameSession,
} from "./api";
import type { SessionSummary } from "./events";
import { dropSessionController } from "./session-controller";

const toThreadMetadata = (s: SessionSummary) => ({
  status: (s.archived_at ? "archived" : "regular") as "archived" | "regular",
  remoteId: s.id,
  externalId: s.id,
  title: s.title ?? undefined,
  lastMessageAt: s.updated_at ? new Date(s.updated_at) : undefined,
});

export const sessionListAdapter: RemoteThreadListAdapter = {
  async list(params) {
    const { sessions, nextCursor } = await listSessions(params?.after);
    return {
      threads: sessions.map(toThreadMetadata),
      nextCursor: nextCursor ?? undefined,
    };
  },

  async initialize() {
    // Called once, on the first message (or first attachment) of a new
    // chat. The returned id becomes both remoteId and externalId, so
    // every later call keys straight off the session id.
    const session = await createSession();
    return { remoteId: session.id, externalId: session.id };
  },

  async rename(remoteId, newTitle) {
    await renameSession(remoteId, newTitle);
  },

  async archive(remoteId) {
    await archiveSession(remoteId);
    dropSessionController(remoteId);
  },

  async unarchive() {
    // Managed Agents sessions can't be unarchived; the UI doesn't offer it.
    throw new Error("Archived sessions cannot be restored.");
  },

  async delete(remoteId) {
    await deleteSession(remoteId);
    dropSessionController(remoteId);
  },

  async fetch(threadId) {
    return toThreadMetadata(await getSession(threadId));
  },

  async generateTitle(remoteId) {
    // The messages route already retitled the session server-side from
    // the first message. Read it back and emit it as the "generated"
    // title so the sidebar renames the row without another model call.
    const session = await getSession(remoteId);
    return createAssistantStream((controller) => {
      controller.appendText(session.title || "New chat");
      controller.close();
    });
  },
};
