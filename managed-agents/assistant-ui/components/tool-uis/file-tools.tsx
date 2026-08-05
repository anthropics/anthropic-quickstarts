"use client";

// The file half of the agent toolset: read, write, edit, glob, grep. Each
// gets a card showing the path (or pattern) it touched. edit is the fun
// one: its input is an old_string/new_string pair, which is exactly what
// the DiffViewer wants, so the change renders as a real diff.

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  FileIcon,
  FilePenIcon,
  FilePlusIcon,
  FolderSearchIcon,
  LoaderIcon,
  ScanSearchIcon,
} from "lucide-react";
import { useState } from "react";
import { DiffViewer } from "@/components/assistant-ui/diff-viewer";
import type { ToolResultPayload } from "@/lib/managed-agents/reducer";
import { cn } from "@/lib/utils";
import { ApprovalBar } from "./approval-bar";

const short = (path: string) => (path.length > 60 ? `…${path.slice(-58)}` : path);

// A one-line header row shared by the simple file cards.
function FileCardHeader({
  icon: Icon,
  verb,
  target,
  running,
  errored,
  meta,
}: {
  icon: typeof FileIcon;
  verb: string;
  target: string;
  running: boolean;
  errored?: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      {running ? (
        <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className={cn("size-3.5 shrink-0", errored ? "text-red-500" : "text-muted-foreground")} />
      )}
      <span className="text-muted-foreground text-xs">{verb}</span>
      <span className="truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px]">{short(target)}</span>
      {meta && <span className="ml-auto shrink-0 text-muted-foreground text-xs">{meta}</span>}
    </div>
  );
}

// Collapsible body used for read/glob/grep output.
function CollapsibleOutput({ text, errored }: { text: string; errored: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").length;
  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-muted-foreground text-xs hover:bg-muted/50"
      >
        <span>{open ? "Hide output" : "Show output"}</span>
        <span>
          {lines} line{lines === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <pre
          className={cn(
            "max-h-72 overflow-auto whitespace-pre-wrap border-t px-3 py-2 font-mono text-[12px]",
            errored ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {text || "(empty)"}
        </pre>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ read
type ReadArgs = { file_path?: string; view_range?: number[] };

export const ReadToolUI: ToolCallMessagePartComponent<ReadArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const range = args?.view_range;
  // No result + turn no longer running = the call was interrupted; and a
  // denied call never gets a result even though the turn resumes. Neither
  // may keep spinning (here and below, mirroring bash/web cards).
  const running = !result && status.type === "running" && approval?.approved !== false;
  return (
    <div className="aui-tool-read my-1 rounded-lg border border-border">
      <FileCardHeader
        icon={FileIcon}
        verb={running ? "Reading" : result ? "Read" : "Read file"}
        target={args?.file_path ?? "…"}
        running={running}
        errored={result?.isError}
        meta={range && range.length ? `lines ${range[0]}–${range[1] ?? "end"}` : undefined}
      />
      <ApprovalBar approval={approval} respondToApproval={respondToApproval} what="read this file" className="border-t px-3 py-2" />
      {result?.text && <CollapsibleOutput text={result.text} errored={!!result.isError} />}
    </div>
  );
};

// ----------------------------------------------------------------- write
type WriteArgs = { file_path?: string; content?: string };

export const WriteToolUI: ToolCallMessagePartComponent<WriteArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const bytes = args?.content?.length ?? 0;
  const running = !result && status.type === "running" && approval?.approved !== false;
  return (
    <div className="aui-tool-write my-1 rounded-lg border border-border">
      <FileCardHeader
        icon={FilePlusIcon}
        verb={running ? "Writing" : result ? "Wrote" : "Write file"}
        target={args?.file_path ?? "…"}
        running={running}
        errored={result?.isError}
        meta={bytes ? `${bytes.toLocaleString()} chars` : undefined}
      />
      <ApprovalBar approval={approval} respondToApproval={respondToApproval} what="write this file" className="border-t px-3 py-2" />
      {result?.isError && result.text && (
        <pre className="whitespace-pre-wrap border-t px-3 py-2 font-mono text-[12px] text-red-600 dark:text-red-400">
          {result.text}
        </pre>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ edit
type EditArgs = { file_path?: string; old_string?: string; new_string?: string; replace_all?: boolean };

export const EditToolUI: ToolCallMessagePartComponent<EditArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const path = args?.file_path ?? "…";
  const running = !result && status.type === "running" && approval?.approved !== false;
  return (
    <div className="aui-tool-edit my-1 rounded-lg border border-border">
      <FileCardHeader
        icon={FilePenIcon}
        verb={running ? "Editing" : result ? "Edited" : "Edit file"}
        target={path}
        running={running}
        errored={result?.isError}
        meta={args?.replace_all ? "replace all" : undefined}
      />
      <ApprovalBar approval={approval} respondToApproval={respondToApproval} what="edit this file" className="border-t px-3 py-2" />
      {args?.old_string !== undefined && args?.new_string !== undefined && (
        <div className="border-t p-2">
          <DiffViewer
            oldFile={{ content: args.old_string, name: path }}
            newFile={{ content: args.new_string, name: path }}
            viewMode="unified"
            showStats={false}
          />
        </div>
      )}
      {result?.isError && result.text && (
        <pre className="whitespace-pre-wrap border-t px-3 py-2 font-mono text-[12px] text-red-600 dark:text-red-400">
          {result.text}
        </pre>
      )}
    </div>
  );
};

// ------------------------------------------------------------ glob/grep
type PatternArgs = { pattern?: string; path?: string };

function patternCard(
  icon: typeof FileIcon,
  // [in-progress, done, proposed/cancelled] — the third avoids claiming a
  // search "Globbed"/"Grepped" when it never ran (denied or interrupted).
  verbs: [string, string, string],
  name: string,
): ToolCallMessagePartComponent<PatternArgs, ToolResultPayload> {
  const Card: ToolCallMessagePartComponent<PatternArgs, ToolResultPayload> = ({
    args,
    result,
    status,
    approval,
    respondToApproval,
  }) => {
    const matches = result?.text ? result.text.split("\n").filter(Boolean).length : 0;
    const running = !result && status.type === "running" && approval?.approved !== false;
    return (
      <div className="my-1 rounded-lg border border-border">
        <FileCardHeader
          icon={icon}
          verb={running ? verbs[0] : result ? verbs[1] : verbs[2]}
          target={`${args?.pattern ?? "…"}${args?.path ? `  in ${args.path}` : ""}`}
          running={running}
          errored={result?.isError}
          meta={result ? `${matches} match${matches === 1 ? "" : "es"}` : undefined}
        />
        <ApprovalBar approval={approval} respondToApproval={respondToApproval} what="search these files" className="border-t px-3 py-2" />
        {result?.text && <CollapsibleOutput text={result.text} errored={!!result.isError} />}
      </div>
    );
  };
  Card.displayName = name;
  return Card;
}

export const GlobToolUI = patternCard(FolderSearchIcon, ["Globbing", "Globbed", "Glob"], "GlobToolUI");
export const GrepToolUI = patternCard(ScanSearchIcon, ["Grepping", "Grepped", "Grep"], "GrepToolUI");
