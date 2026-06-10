import type { ClockEvent } from "@/lib/types";

export type ClockState = "out" | "in" | "on_break";
export type ClockEventType = ClockEvent["type"];

export const STANDARD_DAY_MINUTES = 480;
export const STANDARD_WEEK_MINUTES = 2400;

export const CLOCK_EVENT_TYPES: ClockEventType[] = ["clock_in", "clock_out", "break_start", "break_end"];

/** Valid next event types per current state (the clock state machine). */
export const ALLOWED_TRANSITIONS: Record<ClockState, ClockEventType[]> = {
  out: ["clock_in"],
  in: ["break_start", "clock_out"],
  on_break: ["break_end"],
};

/** Current time as a SQLite-style 'YYYY-MM-DD HH:MM:SS' string (UTC, matching datetime('now')). */
export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Today's date as 'YYYY-MM-DD' (UTC, matching date('now')). */
export function todaySql(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMs(ts: string): number {
  return new Date(ts.replace(" ", "T") + "Z").getTime();
}

/** Derive the clock state from a day's events (ordered by timestamp). */
export function clockStateFromEvents(events: { type: string }[]): ClockState {
  const last = events[events.length - 1];
  if (!last || last.type === "clock_out") return "out";
  if (last.type === "break_start") return "on_break";
  return "in"; // clock_in or break_end
}

/**
 * Worked minutes for a list of events (sorted ascending): sum of
 * (clock_out - clock_in) pairs minus break intervals. If the final
 * interval is still open and `countOpenUntil` is given (display only),
 * count up to that moment.
 */
export function workedMinutes(
  events: { type: string; timestamp: string }[],
  countOpenUntil?: string
): number {
  let totalMs = 0;
  let workStart: number | null = null;
  for (const e of events) {
    if (e.type === "clock_in" || e.type === "break_end") {
      if (workStart === null) workStart = toMs(e.timestamp);
    } else if (e.type === "break_start" || e.type === "clock_out") {
      if (workStart !== null) {
        totalMs += toMs(e.timestamp) - workStart;
        workStart = null;
      }
    }
  }
  if (workStart !== null && countOpenUntil) {
    totalMs += Math.max(0, toMs(countOpenUntil) - workStart);
  }
  return Math.max(0, Math.floor(totalMs / 60000));
}

/** Monday of the week containing the given 'YYYY-MM-DD' date. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isValidDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s + " 00:00:00"));
}

/** Format minutes as e.g. '7h 45m'. */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Extract HH:MM from a 'YYYY-MM-DD HH:MM:SS' timestamp. */
export function fmtTime(ts: string): string {
  return ts.slice(11, 16);
}

export const EVENT_LABELS: Record<ClockEventType, string> = {
  clock_in: "Clocked in",
  clock_out: "Clocked out",
  break_start: "Break started",
  break_end: "Break ended",
};
