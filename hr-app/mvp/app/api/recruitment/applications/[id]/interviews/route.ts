import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCurrentUser, canManage } from "@/lib/session";
import type { Application } from "@/lib/types";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = getCurrentUser();
  if (!canManage(user)) {
    return NextResponse.json({ error: "Forbidden. Managers, HR, or admin only." }, { status: 403 });
  }

  const db = getDb();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid application id." }, { status: 400 });
  }

  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Application | undefined;
  if (!app) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  let body: {
    scheduled_at?: string;
    duration_minutes?: number;
    format?: string;
    interviewer_ids?: number[];
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const scheduled_at = typeof body.scheduled_at === "string" ? body.scheduled_at.trim() : "";
  if (!scheduled_at) {
    return NextResponse.json({ error: "scheduled_at is required." }, { status: 400 });
  }

  const validFormats = ["video", "in_person", "phone"];
  const format = body.format && validFormats.includes(body.format) ? body.format : "video";
  const duration = typeof body.duration_minutes === "number" && body.duration_minutes > 0
    ? body.duration_minutes
    : 60;

  const interviewerIds = Array.isArray(body.interviewer_ids)
    ? body.interviewer_ids.filter((n) => typeof n === "number")
    : [];

  const result = db
    .prepare(
      `INSERT INTO interviews (application_id, scheduled_at, duration_minutes, format, interviewer_ids, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      scheduled_at,
      duration,
      format,
      JSON.stringify(interviewerIds),
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null
    );

  const interviewId = Number(result.lastInsertRowid);
  logAudit(user.id, "create", "interview", interviewId, `app ${id} scheduled ${scheduled_at}`);

  return NextResponse.json({ id: interviewId }, { status: 201 });
}
