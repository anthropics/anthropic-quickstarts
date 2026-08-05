"use client";

// The human-in-the-loop gate for an always_ask tool.
//
// Managed Agents parked the turn on this tool call and is waiting for a
// user.tool_confirmation. Allow lets it run; Deny sends the agent a message
// it sees as the tool's result ("Denied: not on the production box"), so it
// can adjust instead of retrying blindly. Rendered by any tool card whose
// part carries an unresolved `approval` (see reducer.ts).

import { CheckIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Approval = { id: string; approved?: boolean; reason?: string };

export function ApprovalBar({
  approval,
  respondToApproval,
  what = "run this",
  className,
}: {
  approval?: Approval;
  respondToApproval?: (response: { approved: boolean; reason?: string }) => void;
  what?: string;
  className?: string;
}) {
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  // Already answered (in this tab, or replayed from history): show the verdict.
  if (approval && approval.approved !== undefined) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs",
          approval.approved ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          className,
        )}
      >
        {approval.approved ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
        <span className="font-medium">{approval.approved ? "Allowed" : "Denied"}</span>
        {!approval.approved && approval.reason && (
          <span className="text-muted-foreground">— {approval.reason}</span>
        )}
      </div>
    );
  }

  // No pending gate on this call.
  if (!approval || !respondToApproval) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-amber-700 text-xs dark:text-amber-400">
        <ShieldAlertIcon className="size-3.5" />
        <span className="font-medium">The agent wants to {what}. Allow?</span>
      </div>
      {denying ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            respondToApproval({ approved: false, reason: reason.trim() || undefined });
          }}
        >
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional: tell the agent why not"
            className="h-8 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <Button type="submit" size="sm" variant="destructive">
            Deny
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDenying(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => respondToApproval({ approved: true })}>
            <CheckIcon className="size-3.5" />
            Allow
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDenying(true)}>
            <XIcon className="size-3.5" />
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}
