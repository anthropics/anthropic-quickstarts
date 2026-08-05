"use client";

// Wires Managed Agents into assistant-ui. Two layers:
//
//   useRemoteThreadListRuntime — the sidebar. Its adapter is the Managed
//     Agents session list (session-list-adapter.ts), so the thread list IS
//     the session list: no database, no id mapping (thread id = session id).
//
//   useSessionThreadRuntime — one per open thread, mounted by the runtime
//     hook. It reads the active session id off assistant-ui's own state,
//     grabs that session's controller (replay + live tail + actions), and
//     hands its folded event log to useExternalStoreRuntime. A brand-new
//     chat has no session yet: the composer still works, and the first send
//     (or first attachment) creates the session through initialize().

import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createAttachmentAdapter, attachedFilesOf } from "./attachments";
import { sessionListAdapter } from "./session-list-adapter";
import {
  getSessionController,
  type ControllerSnapshot,
  type SessionController,
} from "./session-controller";
import { initialProjection, isBusy } from "./reducer";

// ------------------------------------------------------------- state hookup
const EMPTY: ControllerSnapshot = {
  ...initialProjection(),
  isLoaded: true,
  isTailing: false,
  transportError: null,
};
const subscribeNothing = () => () => {};
const getEmpty = () => EMPTY;

function useControllerSnapshot(controller: SessionController | null): ControllerSnapshot {
  return useSyncExternalStore(
    controller ? controller.subscribe : subscribeNothing,
    controller ? controller.getSnapshot : getEmpty,
    getEmpty,
  );
}

function textOf(message: AppendMessage): string {
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n")
    .trim();
}

// ------------------------------------------------------- per-thread runtime
function useSessionThreadRuntime() {
  const aui = useAui();
  // externalId is the session id for an initialized thread; a new chat has
  // neither until its first send creates the session.
  const sessionId = useAuiState((s) => s.threadListItem.externalId ?? s.threadListItem.remoteId);

  const controller = sessionId ? getSessionController(sessionId) : null;
  const snapshot = useControllerSnapshot(controller);

  // Attach while this thread is the one on screen: replay history and open
  // the live tail. The cleanup detaches when the thread goes to the
  // background (this hook instance stays MOUNTED for background threads, so
  // the gate is isMain, not unmount) — browsers cap concurrent connections
  // per origin, and a tail per visited session would exhaust the cap after
  // a few threads. The controller (and its folded state) stays warm in the
  // registry; attach() re-replays on return, so nothing emitted while
  // detached is lost.
  const isActive = useAuiState((s) => s.threads.mainThreadId === s.threadListItem.id);
  useEffect(() => {
    if (!controller || !isActive) return;
    controller.attach();
    return () => controller.detach();
  }, [controller, isActive]);

  /** Resolve the session id, creating the session for a brand-new chat. */
  const ensureSession = useMemo(
    () => async (): Promise<string> => {
      const { externalId, remoteId } = await aui.threadListItem().initialize();
      const id = externalId ?? remoteId;
      if (!id) throw new Error("session was not created");
      // Warm the controller so the tail is up before anything happens.
      getSessionController(id).attach();
      return id;
    },
    [aui],
  );

  const attachments = useMemo(() => createAttachmentAdapter(ensureSession), [ensureSession]);

  return useExternalStoreRuntime<ThreadMessageLike>({
    // Cast is safe: the reducer's message model is a structural subset of
    // ThreadMessageLike (see reducer.ts).
    messages: snapshot.messages as readonly ThreadMessageLike[],
    convertMessage: (m) => m,
    isLoading: !snapshot.isLoaded,
    // Busy = the agent is working, or a gate/custom tool is waiting on us.
    isRunning: isBusy(snapshot),
    isDisabled: snapshot.isDead,
    adapters: { attachments },

    onNew: async (message: AppendMessage) => {
      const id = await ensureSession();
      const text = textOf(message);
      const files = attachedFilesOf(message.attachments);
      await getSessionController(id).sendMessage(text, files);
    },

    // Stop button: a real interrupt, not just dropping the response.
    onCancel: async () => {
      if (controller) await controller.interrupt();
    },

    // The Allow/Deny click on a gated tool. approvalId is the tool_use
    // event id straight out of session.status_idle{requires_action}.
    onRespondToToolApproval: async ({ approvalId, approved, reason }) => {
      controller?.respondToApproval(approvalId, approved, reason);
    },
  });
}

// ---------------------------------------------------------------- provider
export function ManagedAgentsRuntimeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useRemoteThreadListRuntime({
    adapter: sessionListAdapter,
    // Each mounted thread gets its own instance of this hook.
    runtimeHook: useSessionThreadRuntime,
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

// Convenience for components that want the live session state (files
// panel, connection banner) without going through message rendering.
export function useActiveSessionSnapshot(): ControllerSnapshot & { sessionId: string | null } {
  const sessionId =
    useAuiState((s) => s.threadListItem.externalId ?? s.threadListItem.remoteId) ?? null;
  const controller = sessionId ? getSessionController(sessionId) : null;
  const snapshot = useControllerSnapshot(controller);
  return { ...snapshot, sessionId };
}
