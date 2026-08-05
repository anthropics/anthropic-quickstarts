"use client";

// The whole app: assistant-ui on the outside, Managed Agents underneath.
//
//   ManagedAgentsRuntimeProvider  — sessions are the thread list; the
//                                    active session's event log is the thread
//   ThreadListSidebar             — the session list (list/new/archive/delete)
//   Thread                        — the conversation, rendered from folded
//                                    events, with our per-tool cards and the
//                                    approval gate
//
// The toolkit and suggestions register through useAui, exactly as any
// assistant-ui app does; the only thing Managed-Agents-specific here is the
// runtime provider.

import { AuiProvider, Suggestions, Tools, useAui } from "@assistant-ui/react";
import { AnalystSidebar } from "@/components/analyst-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { SessionFiles } from "@/components/session-files";
import { ManagedAgentsToolFallback, toolkit } from "@/components/tool-uis";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ManagedAgentsRuntimeProvider, useActiveSessionSnapshot } from "@/lib/managed-agents/runtime-provider";

function Welcome() {
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
        Spreadsheet analyst
      </h1>
      <p className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both mt-2 max-w-md text-muted-foreground text-sm delay-75 duration-200">
        Drop in a CSV and ask questions. I analyze it with real shell commands in a
        sandbox, and you approve each one before it runs.
      </p>
    </div>
  );
}

// A thin status strip: relay problems and the "connecting" state, plus the
// files that belong to the open session.
function SessionStatusBar() {
  const { sessionId, isTailing, isLoaded, transportError, lastError } = useActiveSessionSnapshot();
  if (!sessionId) return null;
  return (
    <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-1 px-4 pt-2">
      <SessionFiles />
      {transportError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-700 text-xs dark:text-red-400">
          {transportError}
        </div>
      )}
      {lastError && lastError.retryStatus === "retrying" && (
        <div className="rounded-md bg-muted px-3 py-1.5 text-muted-foreground text-xs">
          Transient error, the session is retrying: {lastError.message}
        </div>
      )}
      {isLoaded && !isTailing && !transportError && (
        <div className="px-1 text-[11px] text-muted-foreground">reconnecting to session…</div>
      )}
    </div>
  );
}

function Workspace() {
  // Register our tool cards and starter prompts on the assistant client.
  const aui = useAui({
    tools: Tools({ toolkit }),
    suggestions: Suggestions([
      {
        title: "Summarize the attached spreadsheet",
        label: "rows, columns, what's in it",
        prompt: "Give me a quick tour of the attached spreadsheet: how many rows and columns, what each column holds, and anything that looks off.",
      },
      {
        title: "Chart revenue by month",
        label: "with the show_chart tool",
        prompt: "Total the revenue by month and show me a chart of it.",
      },
      {
        title: "Find the top 5 customers",
        label: "by total spend",
        prompt: "Who are the top 5 customers by total spend, and what percent of all revenue do they account for?",
      },
    ]),
  });

  return (
    <AuiProvider value={aui}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <AnalystSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <SidebarTrigger />
              <span className="text-muted-foreground text-sm">Claude Managed Agents × assistant-ui</span>
            </header>
            <div className="flex flex-1 flex-col overflow-hidden" style={{ ["--thread-max-width" as string]: "44rem" }}>
              <SessionStatusBar />
              <div className="min-h-0 flex-1">
                <Thread components={{ Welcome, ToolFallback: ManagedAgentsToolFallback }} />
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AuiProvider>
  );
}

export function Assistant() {
  return (
    <ManagedAgentsRuntimeProvider>
      <Workspace />
    </ManagedAgentsRuntimeProvider>
  );
}
