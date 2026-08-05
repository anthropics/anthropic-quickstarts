"use client";

// web_search and web_fetch. Managed Agents returns web_search results as
// structured search_result blocks (title, source URL, snippet), which the
// reducer folds into `result.searchResults`, so the query renders as a chip
// and the hits render as source cards instead of a wall of JSON.

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { GlobeIcon, LoaderIcon, SearchIcon } from "lucide-react";
import type { ToolResultPayload } from "@/lib/managed-agents/reducer";
import { cn } from "@/lib/utils";
import { ApprovalBar } from "./approval-bar";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- search
type SearchArgs = { query?: string };

export const WebSearchToolUI: ToolCallMessagePartComponent<SearchArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const results = result?.searchResults ?? [];
  // An interrupted call never gets a result; only spin while the turn is
  // actually still running (status is the message status until a result lands).
  const running = !result && status.type === "running" && approval?.approved !== false;
  return (
    <div className="aui-tool-web-search my-1 rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {running ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-muted-foreground text-xs">
          {running ? "Searching" : result ? "Searched" : "Search"}
        </span>
        <span className="truncate rounded-md bg-muted px-2 py-0.5 font-medium">{args?.query ?? "…"}</span>
        {result && (
          <span className="ml-auto shrink-0 text-muted-foreground text-xs">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <ApprovalBar
        approval={approval}
        respondToApproval={respondToApproval}
        what="search the web"
        className="border-t px-3 py-2"
      />
      {results.length > 0 && (
        <ul className="grid gap-1 border-t p-2 sm:grid-cols-2">
          {results.slice(0, 6).map((r, i) => (
            <li key={`${r.url}-${i}`}>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex h-full flex-col rounded-md border border-transparent p-2 hover:border-border hover:bg-muted/50"
              >
                <span className="truncate font-medium text-[13px] group-hover:underline">
                  {r.title || hostOf(r.url)}
                </span>
                <span className="truncate text-[11px] text-emerald-700 dark:text-emerald-400">{hostOf(r.url)}</span>
                {r.snippet && (
                  <span className="line-clamp-2 text-[12px] text-muted-foreground">{r.snippet}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!running && results.length === 0 && result?.text && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[12px] text-muted-foreground">
          {result.text}
        </pre>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- fetch
type FetchArgs = { url?: string };

export const WebFetchToolUI: ToolCallMessagePartComponent<FetchArgs, ToolResultPayload> = ({
  args,
  result,
  status,
  approval,
  respondToApproval,
}) => {
  const url = args?.url ?? "";
  // Same guard as WebSearchToolUI: no spinner on a cancelled/denied call.
  const running = !result && status.type === "running" && approval?.approved !== false;
  const errored = !!result?.isError;
  return (
    <div className="aui-tool-web-fetch my-1 rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {running ? (
          <LoaderIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <GlobeIcon className={cn("size-3.5 shrink-0", errored ? "text-red-500" : "text-muted-foreground")} />
        )}
        <span className="text-muted-foreground text-xs">
          {running ? "Fetching" : errored ? "Failed" : result ? "Fetched" : "Fetch"}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-mono text-[12px] hover:underline"
        >
          {url}
        </a>
      </div>
      <ApprovalBar
        approval={approval}
        respondToApproval={respondToApproval}
        what={`fetch ${hostOf(url) || "this page"}`}
        className="border-t px-3 py-2"
      />
      {result?.text && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-[11px] text-muted-foreground">
          {result.text.slice(0, 1200)}
          {result.text.length > 1200 ? "…" : ""}
        </pre>
      )}
    </div>
  );
};
