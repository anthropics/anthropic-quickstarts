import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser, isHr } from "@/lib/session";
import type { Employee } from "@/lib/types";
import StatusBadge from "../_components/StatusBadge";
import { EMPLOYMENT_TYPES, labelFor, ROLES } from "../_components/labels";

export const dynamic = "force-dynamic";

type ProfileRow = Employee & {
  department_name: string | null;
  manager_name: string | null;
};

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-sm text-gray-700">{value ?? "—"}</dd>
    </div>
  );
}

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const db = getDb();
  const user = getCurrentUser();
  const emp = db
    .prepare(
      `SELECT e.*, d.name AS department_name, m.first_name || ' ' || m.last_name AS manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m ON m.id = e.manager_id
       WHERE e.id = ?`
    )
    .get(id) as ProfileRow | undefined;
  if (!emp) notFound();

  const initials = `${emp.first_name[0] ?? ""}${emp.last_name[0] ?? ""}`.toUpperCase();
  const onProbation =
    !!emp.probation_end_date && emp.probation_end_date >= new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Link href="/employees" className="text-sm font-medium text-brand-600 hover:underline">
        ← Employees
      </Link>

      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
            {initials}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">
                {emp.first_name} {emp.last_name}
              </h1>
              <StatusBadge status={emp.status} />
              {onProbation && <span className="badge-blue">On probation</span>}
            </div>
            <p className="text-sm text-gray-500">
              {emp.job_title}
              {emp.department_name ? ` · ${emp.department_name}` : ""} · {emp.employee_number}
            </p>
          </div>
        </div>
        {isHr(user) && (
          <Link href={`/employees/${emp.id}/edit`} className="btn-secondary self-start sm:self-auto">
            Edit
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-3 font-semibold">Personal &amp; contact</h2>
          <dl className="space-y-3">
            <Field
              label="Work email"
              value={
                <a href={`mailto:${emp.work_email}`} className="text-brand-600 hover:underline">
                  {emp.work_email}
                </a>
              }
            />
            <Field label="Personal email" value={emp.personal_email} />
            <Field label="Phone" value={emp.phone} />
            <Field label="Date of birth" value={emp.date_of_birth} />
            <Field label="Gender" value={emp.gender} />
            <Field label="Nationality" value={emp.nationality} />
            <Field label="Address" value={emp.address} />
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Job info</h2>
          <dl className="space-y-3">
            <Field label="Job title" value={emp.job_title} />
            <Field label="Department" value={emp.department_name} />
            <Field
              label="Manager"
              value={
                emp.manager_id && emp.manager_name ? (
                  <Link href={`/employees/${emp.manager_id}`} className="text-brand-600 hover:underline">
                    {emp.manager_name}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Employment type" value={labelFor(EMPLOYMENT_TYPES, emp.employment_type)} />
            <Field label="Start date" value={emp.start_date} />
            <Field label="Probation end date" value={emp.probation_end_date} />
            <Field label="System role" value={labelFor(ROLES, emp.role)} />
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Emergency contact</h2>
          {emp.emergency_contact_name || emp.emergency_contact_phone ? (
            <dl className="space-y-3">
              <Field label="Name" value={emp.emergency_contact_name} />
              <Field label="Phone" value={emp.emergency_contact_phone} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No emergency contact on file.</p>
          )}
        </div>
      </div>
    </div>
  );
}
