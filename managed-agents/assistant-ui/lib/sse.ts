// Minimal server-sent-events writer over a WHATWG ReadableStream, so a Next.js
// route handler can `return sseResponse(stream)` and push events as they
// arrive from Managed Agents.

const encoder = new TextEncoder();

export type SseWriter = {
  /** Send one JSON payload as an SSE `data:` frame. */
  send(payload: unknown): void;
  /** Send a comment frame (keeps proxies from reaping an idle connection). */
  comment(text: string): void;
  close(): void;
  readonly closed: boolean;
};

export function createSseStream(onCancel?: () => void): {
  stream: ReadableStream<Uint8Array>;
  writer: SseWriter;
} {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      // First byte on connect, so the browser's EventSource resolves `open`
      // even before the first real event arrives.
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      closed = true;
      onCancel?.();
    },
  });

  const write = (chunk: string) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      // The client vanished mid-write; treat as closed.
      closed = true;
    }
  };

  const writer: SseWriter = {
    send(payload) {
      write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    comment(text) {
      write(`: ${text}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    get closed() {
      return closed;
    },
  };

  return { stream, writer };
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables Nginx-style response buffering if this ever sits behind one.
      "X-Accel-Buffering": "no",
    },
  });
}

/** JSON error helper for the plain (non-streaming) routes. */
export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
