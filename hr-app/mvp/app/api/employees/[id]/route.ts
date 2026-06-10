import { NextResponse } from "next/server";
import { getDb, logAudit } from "@/lib/db";
import { getCurrentUser, isHr } from "@/lib/session";
import { uniqueConstraintMessage, validateEmployeePayload } from "../_lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = getCurrentUser();
  if (!isHr(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM employees WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = validateEmployeePayload(db, body, { partial: true, selfId: id });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const fields = Object.keys(result.data);
  if (fields.length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  try {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    db.prepare(`UPDATE employees SET ${setClause}, updated_at = datetime('now') WHERE id = @__id`).run({
      ...result.data,
      __id: id,
    });
    logAudit(user.id, "employee.update", "employee", id, `Updated fields: ${fields.join(", ")}`);
    return NextResponse.json({ id });
  } catch (err) {
    const message = uniqueConstraintMessage(err);
    if (message) return NextResponse.json({ error: message }, { status: 409 });
    throw err;
  }
}
