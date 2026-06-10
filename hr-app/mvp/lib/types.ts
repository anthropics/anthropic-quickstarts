export type Role = "admin" | "hr" | "manager" | "employee";

export interface Employee {
  id: number;
  employee_number: string;
  first_name: string;
  last_name: string;
  work_email: string;
  personal_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  job_title: string;
  department_id: number | null;
  manager_id: number | null;
  employment_type: string;
  start_date: string;
  probation_end_date: string | null;
  status: string;
  role: Role;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
}

export interface Department {
  id: number;
  name: string;
  parent_id: number | null;
  head_employee_id: number | null;
}

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  colour: string;
  annual_entitlement_days: number;
  paid: number;
  probation_restricted: number;
  negative_balance_allowed: number;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days: number;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approver_id: number | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface ClockEvent {
  id: number;
  employee_id: number;
  type: "clock_in" | "clock_out" | "break_start" | "break_end";
  timestamp: string;
  method: string;
}

export interface Timesheet {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  total_minutes: number;
  overtime_minutes: number;
  submitted_at: string | null;
  decided_at: string | null;
}
