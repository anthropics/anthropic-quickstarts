"use client";

import { AuiIf, useAuiState, ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";

export const ThreadFollowupSuggestions: FC = () => {
  const suggestions = useAuiState((s) => s.thread.suggestions);
  return (
    <AuiIf
      condition={(s) =>
        !s.thread.isEmpty &&
        !s.thread.isRunning &&
        s.thread.suggestions.length > 0
      }
    >
      <div className="aui-thread-followup-suggestions flex min-h-8 items-center justify-center gap-2">
        {suggestions.map((suggestion, idx) => (
          <ThreadPrimitive.Suggestion
            key={idx}
            className="aui-thread-followup-suggestion bg-background hover:bg-muted/80 rounded-full border px-3 py-1 text-sm transition-colors ease-in"
            prompt={suggestion.prompt}
            method="replace"
            autoSend
          >
            {suggestion.prompt}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </AuiIf>
  );
};
