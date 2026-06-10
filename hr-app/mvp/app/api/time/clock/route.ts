import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  ALLOWED_TRANSITIONS,
  CLOCK_EVENT_TYPES,
  clockStateFromEvents,
  nowSql,
  todaySql,
  type ClockEventType,
} from "@/app/time/_lib/time";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = getCurrentUser();
  const body = (await req.json().catch(() => null)) as { type?: string } | null;
  const type = body?.type as ClockEventType | undefined;

  if (!type || !CLOCK_EVENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid clock event type." }, { status: 400 });
  }

  const db = getDb();
  const todayEvents = db
    .prepare(
      "SELECT type, timestamp FROM clock_events WHERE employee_id = ? AND date(timestamp) = ? ORDER BY timestamp, id"
    )
    .all(user.id, todaySql()) as { type: string; timestamp: string }[];

  const state = clockStateFromEvents(todayEvents);
  if (!ALLOWED_TRANSITIONS[state].includes(type)) {
    const stateLabel = state === "on_break" ? "on break" : state;
    return NextResponse.json(
      { error: `Cannot ${type.replace("_", " ")} while ${stateLabel}.` },
      { status: 400 }
    );
  }

  const result = db
    .prepare("INSERT INTO clock_events (employee_id, type, timestamp, method) VALUES (?, ?, ?, 'web')")
    .run(user.id, type, nowSql());
  logAudit(user.id, `clock.${type}`, "clock_event", Number(result.lastInsertRowid));

  return NextResponse.json({ ok: true });
}
