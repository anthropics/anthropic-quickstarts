"use client";

// Composer attachments backed by the Anthropic Files API.
//
// `add()` runs when the user picks a file: we make sure the thread has a
// session (initialize() creates one for a brand-new chat), then upload +
// mount in a single gated server call (POST /api/sessions/[id]/files).
// The file is a read-only mount in the sandbox before the message is even
// sent, so the agent can `read` it the moment the turn starts. What travels
// with the message is just the mount path, so the agent knows where to look.

import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";
import { uploadSessionFile, type UploadedFile } from "./api";

export const ACCEPT = ".csv,.tsv,.xlsx,.xls,.json,.txt,.md,.pdf";

/** Where an uploaded attachment landed in the sandbox, keyed by the
 *  attachment id assistant-ui tracks. Read back in onNew to build the message. */
const uploaded = new Map<string, UploadedFile>();

export function attachedFilesOf(attachments: readonly CompleteAttachment[] | undefined) {
  return (attachments ?? [])
    .map((a) => uploaded.get(a.id))
    .filter((f): f is UploadedFile => !!f)
    .map((f) => ({ filename: f.filename, mountPath: f.mountPath }));
}

/**
 * Build the attachment adapter for one thread. `getSessionId` must resolve
 * to the Managed Agents session id, creating the session on demand (it wraps
 * `aui.threadListItem().initialize()`).
 */
export function createAttachmentAdapter(getSessionId: () => Promise<string>): AttachmentAdapter {
  return {
    accept: ACCEPT,

    async *add({ file }): AsyncGenerator<PendingAttachment, void> {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const base = { id, type: "document" as const, name: file.name, contentType: file.type, file };

      // Immediately show the tile in "uploading" state.
      yield { ...base, status: { type: "running", reason: "uploading", progress: 0.1 } };

      try {
        const sessionId = await getSessionId();
        yield { ...base, status: { type: "running", reason: "uploading", progress: 0.5 } };
        const info = await uploadSessionFile(sessionId, file);
        uploaded.set(id, info);
        // Ready to ride along with the next message.
        yield { ...base, status: { type: "requires-action", reason: "composer-send" } };
      } catch (err) {
        yield {
          ...base,
          status: {
            type: "incomplete",
            reason: "error",
            message: err instanceof Error ? err.message : "upload failed",
          },
        };
      }
    },

    async remove(attachment) {
      // The composer tile goes away. The already-mounted file stays in the
      // sandbox for this session; it's read-only and session-scoped, so
      // leaving it is harmless (removing needs the resource id we don't
      // track for a not-yet-sent attachment).
      uploaded.delete(attachment.id);
    },

    async send(attachment): Promise<CompleteAttachment> {
      const info = uploaded.get(attachment.id);
      return {
        ...attachment,
        status: { type: "complete" },
        content: [
          {
            type: "file",
            filename: attachment.name,
            data: info?.mountPath ?? attachment.name,
            mimeType: attachment.contentType || "application/octet-stream",
          },
        ],
      };
    },
  };
}
