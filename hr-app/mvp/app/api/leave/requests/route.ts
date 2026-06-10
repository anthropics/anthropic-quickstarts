import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { LeaveType } from "@/lib/types";
import { getHolidaySet, isIsoDate, workingDays } from "@/app/leave/_lib/leave";

export async function POST(request: Request) {
  const user = getCurrentUser();
  const db = getDb();

  let body: { leave_type_id?: number; start_date?: string; end_date?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { leave_type_id, start_date, end_date } = body;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!isIsoDate(start_date) || !isIsoDate(end_date)) {
    return NextResponse.json({ error: "Start and end dates are required (YYYY-MM-DD)." }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
  }

  const leaveType = db.prepare("SELECT * FROM leave_types WHERE id = ?").get(leave_type_id) as LeaveType | undefined;
  if (!leaveType) {
    return NextResponse.json({ error: "Unknown leave type." }, { status: 400 });
  }

  // Probation restriction
  const today = new Date().toISOString().slice(0, 10);
  if (leaveType.probation_restricted === 1 && user.probation_end_date && user.probation_end_date > today) {
    return NextResponse.json(
      { error: `${leaveType.name} is not available during probation (ends ${user.probation_end_date}).` },
      { status: 400 }
    );
  }

  // Overlap with existing pending/approved requests
  const overlap = db
    .prepare(
      `SELECT id, start_date, end_date FROM leave_requests
       WHERE employee_id = ? AND status IN ('pending', 'approved')
         AND start_date <= ? AND end_date >= ?
       LIMIT 1`
    )
    .get(user.id, end_date, start_date) as { id: number; start_date: string; end_date: string } | undefined;
  if (overlap) {
    return NextResponse.json(
      { error: `This overlaps an existing request (${overlap.start_date} to ${overlap.end_date}).` },
      { status: 400 }
    );
  }

  // Working days (server-side)
  const days = workingDays(start_date, end_date, getHolidaySet());
  if (days <= 0) {
    return NextResponse.json(
      { error: "The selected range contains no working days (weekends / public holidays only)." },
      { status: 400 }
    );
  }

  // Balance check (entitled − approved this year, by start_date year)
  if (leaveType.negative_balance_allowed === 0) {
    const year = start_date.slice(0, 4);
    const taken = (
      db
        .prepare(
          `SELECT COALESCE(SUM(days), 0) AS taken FROM leave_requests
           WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved' AND strftime('%Y', start_date) = ?`
        )
        .get(user.id, leaveType.id, year) as { taken: number }
    ).taken;
    const remaining = leaveType.annual_entitlement_days - taken;
    if (days > remaining) {
      return NextResponse.json(
        { error: `Insufficient balance: ${remaining} day(s) of ${leaveType.name} available, ${days} requested.` },
        { status: 400 }
      );
    }
  }

  const result = db
    .prepare(
      `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, notes, status, approver_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(user.id, leaveType.id, start_date, end_date, days, notes, user.manager_id);

  const id = Number(result.lastInsertRowid);
  logAudit(user.id, "create", "leave_request", id, `${leaveType.code} ${start_date}..${end_date} (${days}d)`);

  return NextResponse.json({ id, days, status: "pending" }, { status: 201 });
}
