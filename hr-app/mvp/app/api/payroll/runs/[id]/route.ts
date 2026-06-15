import { NextRequest, NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCurrentUser, isHr } from "@/lib/session";
import type { PayrollRun } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getCurrentUser();
  if (!isHr(user)) {
    return NextResponse.json({ error: "Forbidden: HR/admin only." }, { status: 403 });
  }

  const runId = Number(params.id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: "Invalid run ID." }, { status: 400 });
  }

  let body: { action: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { action } = body;
  if (!["approve", "mark_paid", "cancel"].includes(action)) {
    return NextResponse.json({ error: "action must be one of: approve, mark_paid, cancel." }, { status: 400 });
  }

  const db = getDb();
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(runId) as PayrollRun | undefined;
  if (!run) {
    return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
  }

  // Enforce valid status transitions
  if (action === "approve" && run.status !== "draft") {
    return NextResponse.json({ error: `Cannot approve a run with status '${run.status}'. Only draft runs can be approved.` }, { status: 400 });
  }
  if (action === "mark_paid" && run.status !== "approved") {
    return NextResponse.json({ error: `Cannot mark as paid a run with status '${run.status}'. Only approved runs can be marked paid.` }, { status: 400 });
  }
  if (action === "cancel" && (run.status === "paid" || run.status === "cancelled")) {
    return NextResponse.json({ error: `Cannot cancel a run with status '${run.status}'.` }, { status: 400 });
  }

  let newStatus: string;
  if (action === "approve") newStatus = "approved";
  else if (action === "mark_paid") newStatus = "paid";
  else newStatus = "cancelled";

  if (action === "approve") {
    db.prepare(
      "UPDATE payroll_runs SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?"
    ).run(newStatus, user.id, runId);
  } else {
    db.prepare("UPDATE payroll_runs SET status = ? WHERE id = ?").run(newStatus, runId);
  }

  logAudit(user.id, action, "payroll_run", runId, `Status changed to ${newStatus}`);

  return NextResponse.json({ id: runId, status: newStatus });
}
