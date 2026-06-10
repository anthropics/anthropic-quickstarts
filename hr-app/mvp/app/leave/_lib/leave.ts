import { getDb } from "@/lib/db";
import type { LeaveType } from "@/lib/types";

/** ISO date string YYYY-MM-DD validation. */
export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** All public holiday dates as a Set of YYYY-MM-DD strings. */
export function getHolidaySet(): Set<string> {
  const rows = getDb().prepare("SELECT date FROM public_holidays").all() as { date: string }[];
  return new Set(rows.map((r) => r.date));
}

/**
 * Working days between start and end inclusive, excluding Saturdays,
 * Sundays and public holidays. Dates are YYYY-MM-DD strings.
 */
export function workingDays(start: string, end: string, holidays: Set<string>): number {
  let days = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    const dow = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) days++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export interface Balance {
  leaveType: LeaveType;
  entitled: number;
  taken: number; // approved days this year
  pending: number; // pending days this year
  available: number; // entitled - taken
}

/** Balance per leave type for the given employee and year (by start_date year). */
export function getBalances(employeeId: number, year: number): Balance[] {
  const db = getDb();
  const types = db.prepare("SELECT * FROM leave_types ORDER BY id").all() as LeaveType[];
  const stmt = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'approved' THEN days ELSE 0 END), 0) AS taken,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN days ELSE 0 END), 0) AS pending
     FROM leave_requests
     WHERE employee_id = ? AND leave_type_id = ? AND strftime('%Y', start_date) = ?`
  );
  return types.map((lt) => {
    const row = stmt.get(employeeId, lt.id, String(year)) as { taken: number; pending: number };
    return {
      leaveType: lt,
      entitled: lt.annual_entitlement_days,
      taken: row.taken,
      pending: row.pending,
      available: lt.annual_entitlement_days - row.taken,
    };
  });
}

/** Balance for one leave type (entitled − approved days this year). */
export function getBalanceForType(employeeId: number, leaveTypeId: number, year: number): number {
  const db = getDb();
  const lt = db.prepare("SELECT * FROM leave_types WHERE id = ?").get(leaveTypeId) as LeaveType | undefined;
  if (!lt) return 0;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(days), 0) AS taken FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved' AND strftime('%Y', start_date) = ?`
    )
    .get(employeeId, leaveTypeId, String(year)) as { taken: number };
  return lt.annual_entitlement_days - row.taken;
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "badge-green";
    case "pending":
      return "badge-yellow";
    case "rejected":
      return "badge-red";
    default:
      return "badge-gray";
  }
}

export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
