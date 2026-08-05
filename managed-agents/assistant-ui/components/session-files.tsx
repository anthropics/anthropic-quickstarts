"use client";

// The files that belong to the open session: what you uploaded (mounted
// read-only into the sandbox) and what the agent produced (written to
// /mnt/session/outputs/, downloadable through the Files API). Managed Agents
// emits no "file created" event, so this refreshes when a turn settles.

import { DownloadIcon, FileTextIcon, PaperclipIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { listSessionFiles, sessionFileUrl } from "@/lib/managed-agents/api";
import type { SessionFile } from "@/lib/managed-agents/events";
import { useActiveSessionSnapshot } from "@/lib/managed-agents/runtime-provider";
import { cn } from "@/lib/utils";

const kb = (bytes: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : "");

export function SessionFiles({ className }: { className?: string }) {
  const { sessionId, isRunning, messages } = useActiveSessionSnapshot();
  const [files, setFiles] = useState<SessionFile[]>([]);

  // This component stays mounted across thread switches, so `files` would
  // otherwise carry one session's chips into the next (and the fetch effect
  // below deliberately skips while the new session is mid-turn, which could
  // leave them there for a whole turn). Reset synchronously on switch.
  const [shownSession, setShownSession] = useState(sessionId);
  if (sessionId !== shownSession) {
    setShownSession(sessionId);
    setFiles([]);
  }

  // Refresh after each settled turn (and when switching sessions). The
  // message count changing is a cheap "a turn just finished" signal.
  const turns = messages.length;
  useEffect(() => {
    let cancelled = false;
    if (!sessionId || isRunning) return;
    listSessionFiles(sessionId)
      .then((fs) => !cancelled && setFiles(fs))
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [sessionId, isRunning, turns]);

  if (!sessionId || files.length === 0) return null;

  const outputs = files.filter((f) => f.downloadable);
  const uploads = files.filter((f) => !f.downloadable);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 px-1 text-xs", className)}>
      {uploads.map((f) => (
        <span
          key={f.id}
          title="Mounted read-only in the sandbox"
          className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-muted-foreground"
        >
          <PaperclipIcon className="size-3" />
          {f.filename}
        </span>
      ))}
      {outputs.map((f) => (
        <a
          key={f.id}
          href={sessionFileUrl(sessionId, f.id)}
          download={f.filename}
          className="group flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 font-medium hover:bg-muted"
          title="Produced by the agent (from /mnt/session/outputs)"
        >
          <FileTextIcon className="size-3 text-muted-foreground" />
          {f.filename}
          {f.size_bytes > 0 && <span className="text-muted-foreground">{kb(f.size_bytes)}</span>}
          <DownloadIcon className="size-3 text-muted-foreground group-hover:text-foreground" />
        </a>
      ))}
    </div>
  );
}
