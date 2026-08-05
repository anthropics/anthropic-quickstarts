"use client";

// The quickstart's own sidebar chrome around assistant-ui's <ThreadList/>
// (kept separate so the copy-in threadlist-sidebar.tsx stays regenerable).
// The list itself is the untouched assistant-ui component: it renders the
// Managed Agents session list, because that's the runtime's thread list.

import { TableIcon } from "lucide-react";
import type * as React from "react";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AnalystSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="mb-2 border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <TableIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Spreadsheet analyst</span>
                  <span className="text-muted-foreground text-xs">every chat is a session</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <ThreadList />
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="border-t p-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Claude Managed Agents holds every conversation server-side; this list is{" "}
          <code className="rounded bg-muted px-1">sessions.list()</code>. Nothing is stored here.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
