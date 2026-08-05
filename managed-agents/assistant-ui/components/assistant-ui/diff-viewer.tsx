"use client";

import { type ComponentProps, useMemo } from "react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import { cva, type VariantProps } from "class-variance-authority";
import { diffLines } from "diff";
import parseDiff from "parse-diff";

import { cn } from "@/lib/utils";

type DiffLineType = "add" | "del" | "normal";

interface ParsedLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface ParsedFile {
  oldName?: string | undefined;
  newName?: string | undefined;
  lines: ParsedLine[];
  additions: number;
  deletions: number;
}

interface SplitLinePair {
  left: ParsedLine | null;
  right: ParsedLine | null;
}

function parsePatch(patch: string): ParsedFile[] {
  const files = parseDiff(patch);
  return files.map((file) => {
    const lines: ParsedLine[] = [];
    let additions = 0;
    let deletions = 0;
    for (const chunk of file.chunks) {
      let oldLine = chunk.oldStart;
      let newLine = chunk.newStart;
      for (const change of chunk.changes) {
        if (change.type === "add") {
          additions++;
          lines.push({
            type: "add",
            content: change.content.slice(1),
            newLineNumber: newLine++,
          });
        } else if (change.type === "del") {
          deletions++;
          lines.push({
            type: "del",
            content: change.content.slice(1),
            oldLineNumber: oldLine++,
          });
        } else {
          lines.push({
            type: "normal",
            content: change.content.slice(1),
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
          });
        }
      }
    }
    return {
      oldName: file.from,
      newName: file.to,
      lines,
      additions,
      deletions,
    };
  });
}

function computeDiff(
  oldContent: string,
  newContent: string,
): { lines: ParsedLine[]; additions: number; deletions: number } {
  const changes = diffLines(oldContent, newContent);
  const lines: ParsedLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const contentLines = change.value.replace(/\n$/, "").split("\n");
    for (const content of contentLines) {
      if (change.added) {
        additions++;
        lines.push({ type: "add", content, newLineNumber: newLine++ });
      } else if (change.removed) {
        deletions++;
        lines.push({ type: "del", content, oldLineNumber: oldLine++ });
      } else {
        lines.push({
          type: "normal",
          content,
          oldLineNumber: oldLine++,
          newLineNumber: newLine++,
        });
      }
    }
  }
  return { lines, additions, deletions };
}

function pairLinesForSplit(lines: ParsedLine[]): SplitLinePair[] {
  const pairs: SplitLinePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.type === "normal") {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === "del") {
      const deletions: ParsedLine[] = [];
      while (i < lines.length && lines[i]!.type === "del") {
        deletions.push(lines[i]!);
        i++;
      }
      const additions: ParsedLine[] = [];
      while (i < lines.length && lines[i]!.type === "add") {
        additions.push(lines[i]!);
        i++;
      }
      const maxLen = Math.max(deletions.length, additions.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: deletions[j] ?? null,
          right: additions[j] ?? null,
        });
      }
    } else {
      pairs.push({ left: null, right: line });
      i++;
    }
  }
  return pairs;
}

const diffViewerVariants = cva(
  "aui-diff-viewer overflow-hidden rounded-lg font-mono text-sm",
  {
    variants: {
      variant: {
        default: "bg-background border",
        ghost: "bg-transparent",
        muted: "border-muted-foreground/20 bg-muted border",
      },
      size: {
        sm: "text-xs",
        default: "text-sm",
        lg: "text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const diffLineVariants = cva("flex", {
  variants: {
    type: {
      add: "bg-[var(--diff-add-bg,_rgba(46,160,67,0.15))]",
      del: "bg-[var(--diff-del-bg,_rgba(248,81,73,0.15))]",
      normal: "",
      empty: "",
    },
  },
  defaultVariants: {
    type: "normal",
  },
});

const diffLineTextVariants = cva("", {
  variants: {
    type: {
      add: "text-[var(--diff-add-text,_#1a7f37)] dark:text-[var(--diff-add-text-dark,_#3fb950)]",
      del: "text-[var(--diff-del-text,_#cf222e)] dark:text-[var(--diff-del-text-dark,_#f85149)]",
      normal: "",
      empty: "",
    },
  },
  defaultVariants: {
    type: "normal",
  },
});

function getFileExtension(filename?: string): string {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (!ext) return "";
  return ext.toUpperCase();
}

function DiffViewerFileBadge({ filename }: { filename?: string | undefined }) {
  const ext = getFileExtension(filename);
  if (!ext) return null;

  return (
    <span
      data-slot="diff-viewer-file-badge"
      className="bg-background inline-flex size-5 shrink-0 items-end justify-end rounded-sm border text-[8px] leading-none font-bold"
    >
      <span className="p-0.5">{ext}</span>
    </span>
  );
}

function DiffViewerStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  return (
    <span data-slot="diff-viewer-stats" className="flex gap-2 text-xs">
      <span className="text-green-600 dark:text-green-400">+{additions}</span>
      <span className="text-red-600 dark:text-red-400">-{deletions}</span>
    </span>
  );
}

function DiffViewerFile({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="diff-viewer-file" className={cn(className)} {...props} />
  );
}

function DiffViewerContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="diff-viewer-content"
      className={cn("overflow-x-auto", className)}
      {...props}
    />
  );
}

interface DiffViewerHeaderProps extends ComponentProps<"div"> {
  oldName?: string | undefined;
  newName?: string | undefined;
  additions?: number;
  deletions?: number;
  showIcon?: boolean;
  showStats?: boolean;
}

function DiffViewerHeader({
  oldName,
  newName,
  additions = 0,
  deletions = 0,
  showIcon = true,
  showStats = true,
  className,
  ...props
}: DiffViewerHeaderProps) {
  if (!oldName && !newName) return null;

  const displayName = newName || oldName;

  return (
    <div
      data-slot="diff-viewer-header"
      className={cn(
        "bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-2",
        className,
      )}
      {...props}
    >
      {showIcon && <DiffViewerFileBadge filename={displayName} />}
      <span className="flex-1">
        {oldName && newName && oldName !== newName ? (
          <>
            <span className="text-red-600 dark:text-red-400">{oldName}</span>
            {" → "}
            <span className="text-green-600 dark:text-green-400">
              {newName}
            </span>
          </>
        ) : (
          displayName
        )}
      </span>
      {showStats && (additions > 0 || deletions > 0) && (
        <DiffViewerStats additions={additions} deletions={deletions} />
      )}
    </div>
  );
}

interface DiffViewerLineProps extends ComponentProps<"div"> {
  line: ParsedLine;
  showLineNumbers?: boolean;
}

function DiffViewerLine({
  line,
  showLineNumbers = true,
  className,
  ...props
}: DiffViewerLineProps) {
  const indicator = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";

  return (
    <div
      data-slot="diff-viewer-line"
      data-type={line.type}
      className={cn(diffLineVariants({ type: line.type }), className)}
      {...props}
    >
      {showLineNumbers && (
        <span
          data-slot="diff-viewer-line-number"
          className="text-muted-foreground w-12 shrink-0 px-2 text-end select-none"
        >
          {line.type === "del"
            ? line.oldLineNumber
            : line.type === "add"
              ? line.newLineNumber
              : line.oldLineNumber}
        </span>
      )}
      <span
        data-slot="diff-viewer-indicator"
        className={cn(
          "w-4 shrink-0 text-center select-none",
          diffLineTextVariants({ type: line.type }),
        )}
      >
        {indicator}
      </span>
      <span
        data-slot="diff-viewer-content"
        className={cn(
          "flex-1 break-all whitespace-pre-wrap",
          diffLineTextVariants({ type: line.type }),
        )}
      >
        {line.content}
      </span>
    </div>
  );
}

interface DiffViewerSplitLineProps extends ComponentProps<"div"> {
  pair: SplitLinePair;
  showLineNumbers?: boolean;
}

function DiffViewerSplitLine({
  pair,
  showLineNumbers = true,
  className,
  ...props
}: DiffViewerSplitLineProps) {
  const { left, right } = pair;

  return (
    <div
      data-slot="diff-viewer-split-line"
      className={cn("flex", className)}
      {...props}
    >
      <div
        data-slot="diff-viewer-split-left"
        data-type={left?.type ?? "empty"}
        className={cn(
          "flex w-1/2 border-e",
          diffLineVariants({ type: left?.type ?? "empty" }),
        )}
      >
        {showLineNumbers && (
          <span className="text-muted-foreground w-12 shrink-0 px-2 text-end select-none">
            {left?.oldLineNumber ?? ""}
          </span>
        )}
        <span
          className={cn(
            "w-4 shrink-0 text-center select-none",
            diffLineTextVariants({ type: left?.type ?? "empty" }),
          )}
        >
          {left ? (left.type === "del" ? "-" : " ") : ""}
        </span>
        <span
          className={cn(
            "flex-1 break-all whitespace-pre-wrap",
            diffLineTextVariants({ type: left?.type ?? "empty" }),
          )}
        >
          {left?.content ?? ""}
        </span>
      </div>
      <div
        data-slot="diff-viewer-split-right"
        data-type={right?.type ?? "empty"}
        className={cn(
          "flex w-1/2",
          diffLineVariants({ type: right?.type ?? "empty" }),
        )}
      >
        {showLineNumbers && (
          <span className="text-muted-foreground w-12 shrink-0 px-2 text-end select-none">
            {right?.newLineNumber ?? ""}
          </span>
        )}
        <span
          className={cn(
            "w-4 shrink-0 text-center select-none",
            diffLineTextVariants({ type: right?.type ?? "empty" }),
          )}
        >
          {right ? (right.type === "add" ? "+" : " ") : ""}
        </span>
        <span
          className={cn(
            "flex-1 break-all whitespace-pre-wrap",
            diffLineTextVariants({ type: right?.type ?? "empty" }),
          )}
        >
          {right?.content ?? ""}
        </span>
      </div>
    </div>
  );
}

export type DiffViewerProps = Partial<SyntaxHighlighterProps> &
  VariantProps<typeof diffViewerVariants> & {
    patch?: string;
    oldFile?: { content: string; name?: string };
    newFile?: { content: string; name?: string };
    viewMode?: "split" | "unified";
    showLineNumbers?: boolean;
    showIcon?: boolean;
    showStats?: boolean;
    className?: string;
  };

function DiffViewer({
  code,
  patch,
  oldFile,
  newFile,
  viewMode = "unified",
  showLineNumbers = true,
  showIcon = true,
  showStats = true,
  variant,
  size,
  className,
}: DiffViewerProps) {
  const diffPatch = patch ?? code;
  const oldContent = oldFile?.content;
  const oldName = oldFile?.name;
  const newContent = newFile?.content;
  const newName = newFile?.name;

  const parsedFiles = useMemo<ParsedFile[]>(() => {
    if (diffPatch) {
      return parsePatch(diffPatch);
    }
    if (oldContent !== undefined && newContent !== undefined) {
      const { lines, additions, deletions } = computeDiff(
        oldContent,
        newContent,
      );
      return [
        {
          oldName,
          newName,
          lines,
          additions,
          deletions,
        },
      ];
    }
    return [];
  }, [diffPatch, oldContent, oldName, newContent, newName]);

  const splitLinePairs = useMemo<SplitLinePair[][]>(() => {
    if (viewMode !== "split") return [];
    return parsedFiles.map((file) => pairLinesForSplit(file.lines));
  }, [parsedFiles, viewMode]);

  if (parsedFiles.length === 0) {
    return (
      <pre
        data-slot="diff-viewer"
        className={cn("bg-muted rounded-lg p-4", className)}
      >
        No diff content provided
      </pre>
    );
  }

  return (
    <div
      data-slot="diff-viewer"
      data-view-mode={viewMode}
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={cn(diffViewerVariants({ variant, size }), className)}
    >
      {parsedFiles.map((file, fileIndex) => (
        <div
          key={fileIndex}
          data-slot="diff-viewer-file"
          className="[contain-intrinsic-size:auto_240px] [content-visibility:auto]"
        >
          <DiffViewerHeader
            oldName={file.oldName}
            newName={file.newName}
            additions={file.additions}
            deletions={file.deletions}
            showIcon={showIcon}
            showStats={showStats}
          />
          <div data-slot="diff-viewer-content" className="overflow-x-auto">
            {viewMode === "split"
              ? (splitLinePairs[fileIndex] ?? []).map((pair, pairIndex) => (
                  <DiffViewerSplitLine
                    key={pairIndex}
                    pair={pair}
                    showLineNumbers={showLineNumbers}
                  />
                ))
              : file.lines.map((line, lineIndex) => (
                  <DiffViewerLine
                    key={lineIndex}
                    line={line}
                    showLineNumbers={showLineNumbers}
                  />
                ))}
          </div>
        </div>
      ))}
    </div>
  );
}

DiffViewer.displayName = "DiffViewer";

export type { ParsedLine, ParsedFile, SplitLinePair };

export {
  DiffViewer,
  DiffViewerFile,
  DiffViewerHeader,
  DiffViewerContent,
  DiffViewerLine,
  DiffViewerSplitLine,
  DiffViewerFileBadge,
  DiffViewerStats,
  diffViewerVariants,
  diffLineVariants,
  diffLineTextVariants,
  parsePatch,
  computeDiff,
};
