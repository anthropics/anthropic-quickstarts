"use client";

// One instance per Managed Agents session, held in a registry so switching
// threads in the sidebar keeps every conversation's state warm. It owns the
// three moving parts of a live thread:
//
//   1. replay:  GET /api/sessions/[id]/events, folded through the reducer
//   2. tail:    an EventSource on GET /api/sessions/[id]/stream, opened FIRST
//               (Managed Agents only streams events emitted after attach), and
//               kept open across turns and across the approval pause
//   3. actions: send a message, allow/deny (batched), answer a custom tool,
//               interrupt
//
// React subscribes with useSyncExternalStore; nothing here touches React.

import { messageText, type RelayEnvelope, type StreamEvent } from "./events";
import {
  applyEvent,
  evictOptimisticMessage,
  initialProjection,
  isBusy,
  markResuming,
  restoreGates,
  type Projection,
} from "./reducer";

export type ControllerSnapshot = Projection & {
  /** History fetched at least once (spinner while false). */
  isLoaded: boolean;
  /** The tail is connected. False while replaying or reconnecting. */
  isTailing: boolean;
  /** Last transport-level problem (relay drop, failed action), for a banner. */
  transportError: string | null;
};

type Listener = () => void;

export class SessionController {
  readonly sessionId: string;
  private state: ControllerSnapshot;
  private listeners = new Set<Listener>();
  private source: EventSource | null = null;
  private replayed = false;
  private disposed = false;
  // While folding stored history, a requires_action lands *before* the event
  // that answered it (both are in the same list). Answering custom tools
  // mid-fold would double-post; hold until the whole log is folded.
  private replaying = false;
  // A single in-flight replay. onerror can fire in bursts and attach() may
  // overlap it; concurrent folds would let one finish and clear `replaying`
  // while another is still mid-fold. Everyone shares the running one.
  private replayInFlight: Promise<void> | null = null;
  // A replay requested WHILE one is in flight can't just reuse it: the in-
  // flight fetch may predate the newer disconnect and miss events emitted
  // during it. Note the request and run one more pass when it finishes.
  private rerunNeeded = false;
  // Every time the tail (re)connects there may be a gap: events emitted
  // while no stream was attached exist only in the persisted log, and a
  // fresh live event folding before that backfill replays would misorder
  // the transcript permanently (dedupe bakes it in) — or stamp a
  // requires_action gate before its tool_use exists, wedging the approval.
  // So from each tail onopen until a replay STARTED at-or-after it
  // succeeds (`backfilling`), and before the very first successful load
  // (`!replayed`), live events are buffered here and flushed after the
  // history folds. A FAILED replay keeps buffering and retries below.
  private pendingTail: StreamEvent[] = [];
  private backfilling = false;
  private replayRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private replayRetryDelay = 2000;
  // The tail reconnect delay after a hard close, with backoff.
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private reopenDelay = 1000;
  // Counter for locally synthesized (optimistic) event ids; every synthetic
  // event needs a fresh id or the reducer's dedupe swallows it.
  private optimistic = 0;

  // Confirmation batching: clicks within a short window ride one request,
  // because racing two sends can be rejected mid-resume by the API.
  private confirmQueue: Array<{ tool_use_id: string; result: "allow" | "deny"; deny_message?: string }> = [];
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = { ...initialProjection(), isLoaded: false, isTailing: false, transportError: null };
  }

  // ------------------------------------------------------------ subscription
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): ControllerSnapshot => this.state;

  private set(patch: Partial<ControllerSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Merge a new projection (from a fold, a rollback, or an optimistic
   *  patch) into the snapshot and notify. The one place the post-update
   *  hooks live, so they can't silently diverge between callers. */
  private mergeProjection(next: Partial<ControllerSnapshot>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
    // A session that just died (terminated/deleted) has nothing more to
    // stream; drop the tail so EventSource doesn't keep reconnecting to a
    // route that now 404s.
    if (this.state.isDead && this.source) this.detach();
  }

  private fold(event: StreamEvent) {
    const next = applyEvent(this.state, event);
    if (next === this.state) return;
    this.mergeProjection(next);
    // Live: answer a custom tool as soon as the session parks on it.
    // During replay the answer is usually already later in the log, so
    // wait for the fold to finish (replay() calls this once at the end).
    if (!this.replaying) this.answerPendingCustomTools();
  }

  // -------------------------------------------------------------- lifecycle
  /** Attach: open the tail. The history replay is driven by the tail's own
   *  lifecycle — onopen backfills (anchored to the connect moment, so it
   *  also covers everything missed while detached), onerror replays while
   *  disconnected — so an eager replay here would just fetch the whole log
   *  a second time. Idempotent, and a no-op while a reopen is backing off
   *  (the runtime hook re-renders and calls this on every state change;
   *  without the reopenTimer check a failing stream route would reconnect
   *  in a tight loop). */
  attach(): void {
    if (this.disposed || this.source || this.reopenTimer) return;
    if (this.state.isDead) return; // nothing left to stream or replay
    this.openTail();
  }

  /** Detach: close the tail but keep folded state for a quick return. Also
   *  cancels the pending reopen and replay-retry timers, or a backgrounded
   *  thread would quietly keep reconnecting and refetching in the dark. */
  detach(): void {
    if (this.reopenTimer) {
      clearTimeout(this.reopenTimer);
      this.reopenTimer = null;
    }
    if (this.replayRetryTimer) {
      clearTimeout(this.replayRetryTimer);
      this.replayRetryTimer = null;
    }
    this.source?.close();
    this.source = null;
    // No tail: nothing left to buffer for, and everything buffered is in
    // the persisted log — the reattach backfill refetches it.
    this.backfilling = false;
    this.pendingTail = [];
    this.set({ isTailing: false });
  }

  dispose(): void {
    this.disposed = true;
    this.detach();
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    if (this.reopenTimer) clearTimeout(this.reopenTimer);
    if (this.answerRetryTimer) clearTimeout(this.answerRetryTimer);
    if (this.replayRetryTimer) clearTimeout(this.replayRetryTimer);
    this.listeners.clear();
  }

  private openTail() {
    const source = new EventSource(`/api/sessions/${this.sessionId}/stream`);
    this.source = source;
    source.onopen = () => {
      this.reopenDelay = 1000; // healthy again: reset backoff
      // The stream only delivers events emitted after it attached; anything
      // from before this moment must come from the log. Buffer live events
      // until that backfill lands (this also covers EventSource's silent
      // auto-reconnects, which reuse the same source object).
      this.backfilling = true;
      void this.replay();
      this.set({ isTailing: true, transportError: null });
    };
    source.onmessage = (msg) => {
      let envelope: RelayEnvelope;
      try {
        envelope = JSON.parse(msg.data) as RelayEnvelope;
      } catch {
        return;
      }
      if (envelope.kind !== "event") {
        this.set({ transportError: envelope.message });
        return;
      }
      // Hold live events until the pending backfill has folded history, so
      // the two sources can't interleave out of order (see pendingTail).
      if (!this.replayed || this.backfilling) this.pendingTail.push(envelope.event);
      else this.fold(envelope.event);
    };
    source.onerror = () => {
      this.set({ isTailing: false });
      if (this.disposed) return;
      // A dead session's endpoints 404 forever: reconnecting or replaying
      // would just hammer them. The projection already says so; stop here.
      if (this.state.isDead) {
        if (this.source === source) this.source = null;
        source.close();
        return;
      }
      // Anything emitted while disconnected is in the persisted log; re-fold
      // it (dedupe by event id makes the overlap harmless).
      void this.replay();
      // A transient hiccup: EventSource reconnects by itself. But a non-200
      // or non-SSE response (our route's JSON 502/404) hard-closes it with no
      // auto-reconnect; if we don't reopen, the live tail is dead for good.
      if (source.readyState === EventSource.CLOSED && this.source === source) {
        this.source = null;
        source.close();
        this.scheduleReopen();
      }
    };
  }

  private scheduleReopen() {
    if (this.reopenTimer || this.disposed || this.state.isDead) return;
    const delay = this.reopenDelay;
    this.reopenDelay = Math.min(delay * 2, 30_000);
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      if (this.disposed || this.source || this.state.isDead) return;
      this.openTail(); // onopen (or onerror) drives the replay
    }, delay);
  }

  /** Fold the persisted event log. Safe to call any time: concurrent calls
   *  never fold twice at once. A call that arrives during a fetch queues one
   *  more pass afterward, because that fetch's snapshot may predate a newer
   *  disconnect and miss events emitted during it. */
  replay(): Promise<void> {
    if (this.replayInFlight) {
      this.rerunNeeded = true;
      return this.replayInFlight;
    }
    this.replayInFlight = (async () => {
      do {
        this.rerunNeeded = false;
        await this.doReplay();
      } while (this.rerunNeeded && !this.disposed);
    })().finally(() => {
      this.replayInFlight = null;
    });
    return this.replayInFlight;
  }

  private async doReplay(): Promise<void> {
    this.replaying = true;
    try {
      const res = await fetch(`/api/sessions/${this.sessionId}/events`, { cache: "no-store" });
      if (!res.ok) throw new Error(`history ${res.status}`);
      const body = (await res.json()) as { events: StreamEvent[] };
      for (const event of body.events) this.fold(event);
      this.replayed = true;
      this.replayRetryDelay = 2000; // loaded: reset the retry backoff
      // History is in: fold whatever the tail buffered during the fetch, in
      // arrival order, on top of it, and stop buffering — unless another
      // replay was requested while this one ran (rerunNeeded): that request
      // may cover events this fetch predates, so hold until its pass lands.
      if (!this.rerunNeeded) {
        this.backfilling = false;
        const buffered = this.pendingTail;
        this.pendingTail = [];
        for (const event of buffered) this.fold(event);
      }
      this.set({ isLoaded: true, transportError: null });
    } catch (err) {
      this.set({ isLoaded: true, transportError: describe(err) });
      // The buffer stays intact (folding it over a projection that's still
      // missing its backfill would bake in the misorder the buffer exists
      // to prevent). Nothing else retries a failed replay while the tail is
      // healthy, so do it here — with the same backoff as the tail reopen,
      // and only while attached (detach cancels the timer; attach retries).
      if ((!this.replayed || this.backfilling) && !this.disposed && !this.state.isDead && !this.replayRetryTimer && this.source) {
        const delay = this.replayRetryDelay;
        this.replayRetryDelay = Math.min(delay * 2, 30_000);
        this.replayRetryTimer = setTimeout(() => {
          this.replayRetryTimer = null;
          if ((!this.replayed || this.backfilling) && !this.disposed && !this.state.isDead) void this.replay();
        }, delay);
      }
    } finally {
      // The fold settled one way or the other: whatever is *still* pending
      // really is owed (e.g. the tab closed before we answered a chart).
      this.replaying = false;
      this.answerPendingCustomTools();
    }
  }

  // --------------------------------------------------------------- actions
  async sendMessage(text: string, files: Array<{ filename: string; mountPath: string }>) {
    // Make sure the tail is up before the turn starts producing events.
    this.attach();
    // And that stored history is fully folded first: an optimistic bubble
    // sitting at the end while old messages fold in beneath it could be
    // mistaken for one of their echoes. That means both the first load AND
    // any reconnect backfill still in flight (`backfilling`) — folding the
    // bubble over a projection missing its gap misorders it permanently.
    // Wait on the current pass (usually already finished) — and if it
    // FAILED (doReplay resolves either way), refuse the send rather than
    // fold the bubble into a projection with a hole under it.
    if (!this.replayed || this.backfilling) {
      await (this.replayInFlight ?? this.replay());
      if (!this.replayed || this.backfilling) {
        throw new Error("The conversation history hasn't loaded yet; try again in a moment.");
      }
    }

    // Show the bubble and the "working" state now; the echoed user.message
    // replaces the optimistic bubble (same id, see reducer), and the real
    // status events take over the running flag.
    const n = ++this.optimistic;
    const optimisticId = `optimistic-${n}`;
    const now = new Date().toISOString();
    this.fold({
      type: "user.message",
      id: optimisticId,
      // Same builder the server uses, so the echo's text is byte-identical
      // and the reducer reconciles it in place instead of adding a bubble.
      content: [{ type: "text", text: messageText(text, files) }],
      processed_at: now,
    } as unknown as StreamEvent);
    this.fold({
      type: "session.status_running",
      id: `optimistic-run-${n}`,
      processed_at: now,
    } as unknown as StreamEvent);

    let res: Response;
    try {
      res = await fetch(`/api/sessions/${this.sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, files }),
      });
    } catch (err) {
      this.rollbackSend(optimisticId);
      throw err;
    }
    if (!res.ok) {
      // Nothing was sent: pull the bubble back out of the transcript so it
      // never reads as delivered. (Replay can't do this; it only adds.)
      this.rollbackSend(optimisticId);
      throw new Error(await messageOf(res, "message failed"));
    }
  }

  private rollbackSend(optimisticId: string) {
    this.mergeProjection(evictOptimisticMessage(this.state, optimisticId));
  }

  /** The Allow/Deny click. Optimistically settles the gate, then batches. */
  respondToApproval(toolUseId: string, approved: boolean, reason?: string) {
    // Already queued for this batch: a double-click must not send the
    // same confirmation twice.
    if (this.confirmQueue.some((c) => c.tool_use_id === toolUseId)) return;

    // Optimistic: fold a synthetic confirmation so the buttons disappear at
    // once. Its id is unique per click (a retry after a restored gate must
    // fold again; a reused id would already be in `seen` and dedupe out).
    // The real echoed user.tool_confirmation re-confirms the same state.
    this.fold({
      type: "user.tool_confirmation",
      id: `optimistic-confirm-${++this.optimistic}`,
      tool_use_id: toolUseId,
      result: approved ? "allow" : "deny",
      ...(reason ? { deny_message: reason } : {}),
      processed_at: new Date().toISOString(),
    } as unknown as StreamEvent);

    this.confirmQueue.push({
      tool_use_id: toolUseId,
      result: approved ? "allow" : "deny",
      ...(!approved && reason ? { deny_message: reason } : {}),
    });
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => void this.flushConfirmations(), 250);

    // That was the last open gate: the session is about to resume. Keep the
    // composer busy until the real status_running lands, or the window
    // between click and echo briefly accepts a message mid-resume (and the
    // action bar flashes). A failed POST undoes this via restoreGates.
    const next = markResuming(this.state);
    if (next !== this.state) this.mergeProjection(next);
  }

  private async flushConfirmations() {
    const confirmations = this.confirmQueue;
    this.confirmQueue = [];
    this.confirmTimer = null;
    if (confirmations.length === 0) return;
    try {
      const res = await fetch(`/api/sessions/${this.sessionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmations }),
      });
      if (!res.ok) throw new Error(await messageOf(res, "confirmation failed"));
    } catch (err) {
      // The server never took our answer, so the session is still parked.
      // Undo the optimistic settle by putting those gates back (a replay
      // can't: the parked status_idle is already in `seen` and dedupes out).
      const ids = confirmations.map((c) => c.tool_use_id);
      const next = restoreGates(this.state, ids);
      this.mergeProjection({ ...next, transportError: describe(err) });
    }
  }

  /** Custom tools are ours to execute. show_chart's "execution" is just
   *  rendering, so answer the moment the reducer flags one pending. A
   *  failed answer must be retried: the session emits nothing while it waits
   *  on us, so no later fold would ever bring us back here. */
  private answering = new Set<string>();
  private answerAttempts = new Map<string, number>();
  // Earliest wall-clock time each id may be tried again. This is what makes
  // the backoff real: replay's finally also calls us on every replay, and
  // without this gate a burst of reconnect-driven replays would burn every
  // attempt in about a second and then give up for good.
  private retryAfter = new Map<string, number>();
  private answerRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private answerPendingCustomTools() {
    const now = Date.now();
    for (const id of this.state.pendingCustomTools) {
      if (this.answering.has(id) || this.state.answeredCustomTools.has(id)) continue;
      if ((this.retryAfter.get(id) ?? 0) > now) continue; // still backing off
      const attempt = (this.answerAttempts.get(id) ?? 0) + 1;
      if (attempt > 5) continue; // gave up; the banner tells the user
      this.answerAttempts.set(id, attempt);
      this.answering.add(id);
      void fetch(`/api/sessions/${this.sessionId}/tool-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_tool_use_id: id }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`tool result ${res.status}`);
          this.answerAttempts.delete(id);
          this.retryAfter.delete(id);
          // Fold our own answer so a reattach never re-answers it.
          this.fold({
            type: "user.custom_tool_result",
            id: `optimistic-result-${id}`,
            custom_tool_use_id: id,
            content: [],
            is_error: false,
            processed_at: new Date().toISOString(),
          } as unknown as StreamEvent);
          // Answering the last owed tool resumes the session, exactly like
          // the last Allow/Deny click: keep the composer busy until the
          // real status_running lands (see respondToApproval).
          const next = markResuming(this.state);
          if (next !== this.state) this.mergeProjection(next);
        })
        .catch((err) => {
          this.set({ transportError: describe(err) });
          // Back off, then try again: the session is parked until we succeed.
          const delay = Math.min(1500 * 2 ** (attempt - 1), 15_000);
          this.retryAfter.set(id, Date.now() + delay);
          if (!this.disposed && !this.answerRetryTimer) {
            this.answerRetryTimer = setTimeout(() => {
              this.answerRetryTimer = null;
              this.answerPendingCustomTools();
            }, delay);
          }
        })
        .finally(() => this.answering.delete(id));
    }
  }

  async interrupt(): Promise<void> {
    const res = await fetch(`/api/sessions/${this.sessionId}/interrupt`, { method: "POST" });
    if (!res.ok) throw new Error(await messageOf(res, "interrupt failed"));
  }

  get busy(): boolean {
    return isBusy(this.state);
  }
}

// ------------------------------------------------------------------ registry
// Controllers outlive the component that mounts them: switching threads and
// coming back is instant, and an approval waiting in a background thread is
// still there when you return.

const registry = new Map<string, SessionController>();

export function getSessionController(sessionId: string): SessionController {
  let controller = registry.get(sessionId);
  if (!controller) {
    controller = new SessionController(sessionId);
    registry.set(sessionId, controller);
  }
  return controller;
}

export function dropSessionController(sessionId: string): void {
  const controller = registry.get(sessionId);
  controller?.dispose();
  registry.delete(sessionId);
}

// ---------------------------------------------------------------- helpers
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function messageOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}
