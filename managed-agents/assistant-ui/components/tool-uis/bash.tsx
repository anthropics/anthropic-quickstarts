"use client";

// bash renders as a terminal. When the agent's toolset has bash set to
// always_ask, the session parks on this call and the reducer stamps an
// unresolved approval onto the part: the command shows first (so you can read
// exactly what will run), the Allow/Deny gate sits under it, and the output
// only exists after Allow.

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { LoaderIcon, TerminalIcon } from "lucide-react";
import type { ToolResultPayload } from "@/lib/managed-agents/reducer";
import { cn } from "@/lib/utils";
import { ApprovalBar } from "./approval-bar";

type BashArgs = { command?: string; restart?: boolean };

export const BashToolUI: ToolCallMessagePartComponent<BashArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const command = args?.command ?? (args?.restart ? "# restart the shell" : "");
  const awaiting = !!approval && approval.approved === undefined;
  const denied = approval?.approved === false;
  // Only a live turn can still produce output. A denied or interrupted call
  // never gets a result, so "no result yet" alone must not spin forever;
  // the part's status (the message status while there's no result) says
  // whether the turn is actually still going.
  const running = !result && !awaiting && !denied && status.type === "running";
  const errored = !!result?.isError || status.type === "incomplete";

  return (
    <div
      className={cn(
        "aui-tool-bash my-1 overflow-hidden rounded-lg border font-mono text-[13px]",
        awaiting ? "border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]" : "border-border",
      )}
    >
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <TerminalIcon className="size-3.5" />
          <span>bash</span>
          {awaiting && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
              awaiting approval
            </span>
          )}
          {denied && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-400">
              denied
            </span>
          )}
        </div>
        {running && <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />}
      </div>

      <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-zinc-950 px-3 py-2 text-zinc-100">
        <span className="select-none text-emerald-400">$ </span>
        {command}
      </pre>

      {(awaiting || approval?.approved !== undefined) && (
        <div className="border-t bg-background px-3 py-2">
          <ApprovalBar
            approval={approval}
            respondToApproval={respondToApproval}
            what="run this command"
          />
        </div>
      )}

      {result && (
        <pre
          className={cn(
            "max-h-72 overflow-auto whitespace-pre-wrap break-all border-t px-3 py-2 text-[12px]",
            errored ? "bg-red-950/40 text-red-200" : "bg-zinc-900 text-zinc-300",
          )}
        >
          {result.text || (errored ? "(command failed with no output)" : "(no output)")}
        </pre>
      )}
    </div>
  );
};
