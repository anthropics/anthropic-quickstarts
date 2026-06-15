import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(path.join(process.cwd(), "hrcore.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  seedPhase2(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES departments(id),
    head_employee_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    work_email TEXT NOT NULL UNIQUE,
    personal_email TEXT,
    phone TEXT,
    date_of_birth TEXT,
    gender TEXT,
    nationality TEXT,
    job_title TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    manager_id INTEGER REFERENCES employees(id),
    employment_type TEXT NOT NULL DEFAULT 'full_time',  -- full_time | part_time | contract | intern
    start_date TEXT NOT NULL,
    probation_end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',              -- active | on_leave | terminated
    role TEXT NOT NULL DEFAULT 'employee',              -- admin | hr | manager | employee
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leave_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    colour TEXT NOT NULL DEFAULT '#3b5bdb',
    annual_entitlement_days REAL NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 1,
    probation_restricted INTEGER NOT NULL DEFAULT 0,
    negative_balance_allowed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days REAL NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled
    approver_id INTEGER REFERENCES employees(id),
    decided_at TEXT,
    decision_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS public_holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'ZA'
  );

  CREATE TABLE IF NOT EXISTS clock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    type TEXT NOT NULL,                       -- clock_in | clock_out | break_start | break_end
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    method TEXT NOT NULL DEFAULT 'web'
  );

  CREATE TABLE IF NOT EXISTS timesheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',     -- draft | submitted | approved | rejected
    total_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT,
    decided_at TEXT,
    UNIQUE(employee_id, period_start)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author_id INTEGER REFERENCES employees(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Phase 2: Payroll ───────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS earnings_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'allowance',  -- basic | allowance | bonus
    taxable INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS deduction_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    calc_type TEXT NOT NULL DEFAULT 'percentage',  -- percentage | fixed
    rate REAL NOT NULL DEFAULT 0,   -- % (e.g. 1 = 1%) or fixed rand amount
    pre_tax INTEGER NOT NULL DEFAULT 0,
    statutory INTEGER NOT NULL DEFAULT 0           -- 1 = computed by engine, not editable
  );

  CREATE TABLE IF NOT EXISTS employee_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    earnings_code_id INTEGER NOT NULL REFERENCES earnings_codes(id),
    amount REAL NOT NULL,
    effective_from TEXT NOT NULL DEFAULT (date('now')),
    UNIQUE(employee_id, earnings_code_id)
  );

  CREATE TABLE IF NOT EXISTS employee_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    deduction_code_id INTEGER NOT NULL REFERENCES deduction_codes(id),
    override_amount REAL,          -- null = use code default rate; set for fixed overrides
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(employee_id, deduction_code_id)
  );

  CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | paid | cancelled
    notes TEXT,
    created_by INTEGER REFERENCES employees(id),
    approved_by INTEGER REFERENCES employees(id),
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    gross_pay REAL NOT NULL DEFAULT 0,
    income_tax REAL NOT NULL DEFAULT 0,
    uif_employee REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    net_pay REAL NOT NULL DEFAULT 0,
    lines TEXT NOT NULL DEFAULT '[]',  -- JSON: [{label, amount, type:'earning'|'deduction'}]
    UNIQUE(payroll_run_id, employee_id)
  );

  -- ── Phase 2: ATS / Recruitment ─────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS job_postings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    location TEXT,
    description TEXT,
    requirements TEXT,
    employment_type TEXT NOT NULL DEFAULT 'full_time',
    status TEXT NOT NULL DEFAULT 'draft',  -- draft | open | closed | on_hold
    posted_at TEXT,
    closes_at TEXT,
    created_by INTEGER REFERENCES employees(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    cv_filename TEXT,
    source TEXT NOT NULL DEFAULT 'direct',  -- direct | linkedin | indeed | referral | internal
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_posting_id INTEGER NOT NULL REFERENCES job_postings(id),
    candidate_id INTEGER NOT NULL REFERENCES candidates(id),
    stage TEXT NOT NULL DEFAULT 'applied',
      -- applied | screening | phone_screen | interview | assessment | offer | hired | rejected | withdrawn
    notes TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(job_posting_id, candidate_id)
  );

  CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    format TEXT NOT NULL DEFAULT 'video',   -- video | in_person | phone
    interviewer_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of employee ids
    notes TEXT,
    rating INTEGER,                              -- 1-5
    feedback_submitted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    salary REAL NOT NULL,
    start_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | accepted | rejected | expired
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Phase 2: Onboarding ────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS onboarding_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    department_id INTEGER REFERENCES departments(id)  -- null = applies to all
  );

  CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES onboarding_templates(id),
    title TEXT NOT NULL,
    description TEXT,
    assignee_type TEXT NOT NULL DEFAULT 'new_hire',  -- hr | it | manager | new_hire
    due_offset_days INTEGER NOT NULL DEFAULT 0,       -- days from start_date
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS onboarding_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    template_id INTEGER NOT NULL REFERENCES onboarding_templates(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    UNIQUE(employee_id, template_id)
  );

  CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES onboarding_instances(id),
    template_task_id INTEGER REFERENCES onboarding_template_tasks(id),
    title TEXT NOT NULL,
    description TEXT,
    assignee_type TEXT NOT NULL DEFAULT 'new_hire',
    assigned_to_id INTEGER REFERENCES employees(id),
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | skipped
    completed_at TEXT,
    notes TEXT,
    order_index INTEGER NOT NULL DEFAULT 0
  );
  `);
}

function seed(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number };
  if (count.n > 0) return;

  const insertDept = db.prepare("INSERT INTO departments (name, parent_id) VALUES (?, ?)");
  const exec = insertDept.run("Executive", null);
  const eng = insertDept.run("Engineering", exec.lastInsertRowid);
  const sales = insertDept.run("Sales", exec.lastInsertRowid);
  const people = insertDept.run("People & Culture", exec.lastInsertRowid);
  const fin = insertDept.run("Finance", exec.lastInsertRowid);

  const insertEmp = db.prepare(`
    INSERT INTO employees
      (employee_number, first_name, last_name, work_email, phone, job_title,
       department_id, manager_id, employment_type, start_date, probation_end_date, role, gender, nationality)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // CEO
  const ceo = insertEmp.run("EMP001", "Naledi", "Mokoena", "naledi@acme.co.za", "+27 82 000 0001",
    "Chief Executive Officer", exec.lastInsertRowid, null, "full_time", "2020-01-15", null, "admin", "female", "South African");
  // Heads
  const cto = insertEmp.run("EMP002", "Thabo", "Nkosi", "thabo@acme.co.za", "+27 82 000 0002",
    "CTO", eng.lastInsertRowid, ceo.lastInsertRowid, "full_time", "2020-03-01", null, "manager", "male", "South African");
  const salesHead = insertEmp.run("EMP003", "Sarah", "van der Merwe", "sarah@acme.co.za", "+27 82 000 0003",
    "Head of Sales", sales.lastInsertRowid, ceo.lastInsertRowid, "full_time", "2020-06-01", null, "manager", "female", "South African");
  const hrHead = insertEmp.run("EMP004", "Lerato", "Dlamini", "lerato@acme.co.za", "+27 82 000 0004",
    "Head of People", people.lastInsertRowid, ceo.lastInsertRowid, "full_time", "2021-02-01", null, "hr", "female", "South African");
  const finHead = insertEmp.run("EMP005", "James", "Okafor", "james@acme.co.za", "+27 82 000 0005",
    "Finance Manager", fin.lastInsertRowid, ceo.lastInsertRowid, "full_time", "2021-04-12", null, "manager", "male", "Nigerian");

  // ICs
  const ics: Array<[string, string, string, string, number | bigint, number | bigint, string, string | null, string]> = [
    ["EMP006", "Sipho", "Zulu", "Senior Software Engineer", eng.lastInsertRowid, cto.lastInsertRowid, "2021-08-01", null, "male"],
    ["EMP007", "Aisha", "Patel", "Software Engineer", eng.lastInsertRowid, cto.lastInsertRowid, "2022-01-10", null, "female"],
    ["EMP008", "Dan", "Botha", "DevOps Engineer", eng.lastInsertRowid, cto.lastInsertRowid, "2022-05-16", null, "male"],
    ["EMP009", "Zanele", "Khumalo", "Frontend Engineer", eng.lastInsertRowid, cto.lastInsertRowid, "2025-11-03", "2026-05-03", "female"],
    ["EMP010", "Pieter", "Joubert", "Account Executive", sales.lastInsertRowid, salesHead.lastInsertRowid, "2022-09-01", null, "male"],
    ["EMP011", "Nomvula", "Sithole", "Sales Development Rep", sales.lastInsertRowid, salesHead.lastInsertRowid, "2026-03-02", "2026-09-02", "female"],
    ["EMP012", "Emma", "Smith", "HR Coordinator", people.lastInsertRowid, hrHead.lastInsertRowid, "2023-02-20", null, "female"],
    ["EMP013", "Kabelo", "Mahlangu", "Accountant", fin.lastInsertRowid, finHead.lastInsertRowid, "2023-07-03", null, "male"],
  ];
  for (const [num, fn, ln, title, dept, mgr, start, probation, gender] of ics) {
    insertEmp.run(num, fn, ln, `${fn.toLowerCase()}.${ln.toLowerCase().replace(/\s/g, "")}@acme.co.za`,
      null, title, dept, mgr, "full_time", start, probation, "employee", gender, "South African");
  }

  // Department heads
  db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(ceo.lastInsertRowid, exec.lastInsertRowid);
  db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(cto.lastInsertRowid, eng.lastInsertRowid);
  db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(salesHead.lastInsertRowid, sales.lastInsertRowid);
  db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(hrHead.lastInsertRowid, people.lastInsertRowid);
  db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(finHead.lastInsertRowid, fin.lastInsertRowid);

  // Leave types
  const insertLt = db.prepare(`
    INSERT INTO leave_types (name, code, colour, annual_entitlement_days, paid, probation_restricted, negative_balance_allowed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertLt.run("Annual Leave", "ANNUAL", "#3b5bdb", 18, 1, 0, 0);
  insertLt.run("Sick Leave", "SICK", "#e8590c", 10, 1, 0, 1);
  insertLt.run("Maternity / Paternity", "PARENTAL", "#9c36b5", 90, 1, 1, 0);
  insertLt.run("Study Leave", "STUDY", "#2f9e44", 5, 1, 1, 0);
  insertLt.run("Unpaid Leave", "UNPAID", "#868e96", 0, 0, 0, 1);

  // Public holidays (SA, 2026 subset)
  const insertHol = db.prepare("INSERT INTO public_holidays (name, date, region) VALUES (?, ?, 'ZA')");
  insertHol.run("New Year's Day", "2026-01-01");
  insertHol.run("Human Rights Day", "2026-03-21");
  insertHol.run("Good Friday", "2026-04-03");
  insertHol.run("Family Day", "2026-04-06");
  insertHol.run("Freedom Day", "2026-04-27");
  insertHol.run("Workers' Day", "2026-05-01");
  insertHol.run("Youth Day", "2026-06-16");
  insertHol.run("National Women's Day", "2026-08-09");
  insertHol.run("Heritage Day", "2026-09-24");
  insertHol.run("Day of Reconciliation", "2026-12-16");
  insertHol.run("Christmas Day", "2026-12-25");
  insertHol.run("Day of Goodwill", "2026-12-26");

  // Sample leave requests
  const insertReq = db.prepare(`
    INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days, notes, status, approver_id, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReq.run(6, 1, "2026-06-22", "2026-06-26", 5, "Family holiday", "pending", 2, null);
  insertReq.run(7, 2, "2026-06-08", "2026-06-09", 2, "Flu", "approved", 2, "2026-06-08 09:00:00");
  insertReq.run(10, 1, "2026-07-06", "2026-07-10", 5, "Winter break", "pending", 3, null);
  insertReq.run(12, 1, "2026-05-04", "2026-05-06", 3, null, "approved", 4, "2026-04-28 10:00:00");

  // Announcements
  const insertAnn = db.prepare("INSERT INTO announcements (title, body, author_id) VALUES (?, ?, ?)");
  insertAnn.run("Welcome to HRCore", "Our new HR platform is live. Update your profile and explore leave & time tracking.", 4);
  insertAnn.run("Youth Day — office closed", "The office is closed on 16 June for Youth Day.", 4);

  // Clock events for today (a few people clocked in)
  const insertClock = db.prepare("INSERT INTO clock_events (employee_id, type, timestamp, method) VALUES (?, ?, ?, 'web')");
  const today = new Date().toISOString().slice(0, 10);
  insertClock.run(6, "clock_in", `${today} 08:02:00`);
  insertClock.run(8, "clock_in", `${today} 07:45:00`);
  insertClock.run(12, "clock_in", `${today} 08:15:00`);
}

function seedPhase2(db: Database.Database) {
  const alreadySeeded = (db.prepare("SELECT COUNT(*) AS n FROM earnings_codes").get() as { n: number }).n > 0;
  if (alreadySeeded) return;

  // ── Earnings codes ────────────────────────────────────────────────────────
  const insertEc = db.prepare("INSERT INTO earnings_codes (name, code, type, taxable) VALUES (?, ?, ?, ?)");
  const basicCode = insertEc.run("Basic Salary", "BASIC", "basic", 1);
  const housingCode = insertEc.run("Housing Allowance", "HOUSING", "allowance", 1);
  const travelCode = insertEc.run("Travel Allowance", "TRAVEL", "allowance", 0);
  const bonusCode = insertEc.run("Performance Bonus", "BONUS", "bonus", 1);

  // ── Deduction codes ───────────────────────────────────────────────────────
  const insertDc = db.prepare("INSERT INTO deduction_codes (name, code, calc_type, rate, pre_tax, statutory) VALUES (?, ?, ?, ?, ?, ?)");
  insertDc.run("PAYE Income Tax", "PAYE", "percentage", 0, 0, 1);  // engine-computed
  insertDc.run("UIF (Employee)", "UIF", "percentage", 1, 0, 1);    // 1% statutory
  insertDc.run("Pension Fund", "PENSION", "percentage", 7.5, 1, 0);
  insertDc.run("Medical Aid", "MEDICAL", "fixed", 1800, 0, 0);

  // ── Employee salaries & deductions (all active employees) ─────────────────
  const employees = db.prepare("SELECT id FROM employees WHERE status = 'active'").all() as { id: number }[];
  const baseSalaries: Record<number, number> = {
    1: 150000, 2: 120000, 3: 115000, 4: 95000, 5: 100000,
    6: 85000, 7: 75000, 8: 78000, 9: 65000, 10: 70000,
    11: 45000, 12: 55000, 13: 60000,
  };
  const insertEe = db.prepare("INSERT OR IGNORE INTO employee_earnings (employee_id, earnings_code_id, amount) VALUES (?, ?, ?)");
  const insertEd = db.prepare("INSERT OR IGNORE INTO employee_deductions (employee_id, deduction_code_id, override_amount) VALUES (?, ?, ?)");
  const pensionId = (db.prepare("SELECT id FROM deduction_codes WHERE code = 'PENSION'").get() as { id: number }).id;
  const medicalId = (db.prepare("SELECT id FROM deduction_codes WHERE code = 'MEDICAL'").get() as { id: number }).id;
  for (const emp of employees) {
    const basic = baseSalaries[emp.id] ?? 50000;
    insertEe.run(emp.id, basicCode.lastInsertRowid, basic);
    if (emp.id <= 5) insertEe.run(emp.id, housingCode.lastInsertRowid, 5000);
    if ([2, 3, 5].includes(emp.id)) insertEe.run(emp.id, travelCode.lastInsertRowid, 3500);
    insertEd.run(emp.id, pensionId, null);
    insertEd.run(emp.id, medicalId, null);
  }

  // ── Sample payroll run (June 2026 — approved) ─────────────────────────────
  const insertRun = db.prepare(`
    INSERT INTO payroll_runs (period_start, period_end, payment_date, status, created_by, approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const run = insertRun.run("2026-06-01", "2026-06-30", "2026-06-25", "approved", 5, 1, "2026-06-20 10:00:00");

  // Generate payslips for each employee using a simple engine
  const allEmps = db.prepare("SELECT id FROM employees WHERE status = 'active'").all() as { id: number }[];
  const insertPayslip = db.prepare(`
    INSERT INTO payslips (payroll_run_id, employee_id, gross_pay, income_tax, uif_employee, total_deductions, net_pay, lines)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const pensionCodeId = pensionId;
  const medicalCodeId = medicalId;
  for (const emp of allEmps) {
    const earnings = db.prepare("SELECT ec.name, ec.taxable, ee.amount FROM employee_earnings ee JOIN earnings_codes ec ON ec.id = ee.earnings_code_id WHERE ee.employee_id = ?").all(emp.id) as { name: string; taxable: number; amount: number }[];
    const deductions = db.prepare("SELECT dc.name, dc.code, dc.calc_type, dc.rate, dc.pre_tax, dc.statutory, ed.override_amount FROM employee_deductions ed JOIN deduction_codes dc ON dc.id = ed.deduction_code_id WHERE ed.employee_id = ? AND ed.active = 1").all(emp.id) as { name: string; code: string; calc_type: string; rate: number; pre_tax: number; statutory: number; override_amount: number | null }[];

    const gross = earnings.reduce((s, e) => s + e.amount, 0);
    const taxableEarnings = earnings.filter(e => e.taxable).reduce((s, e) => s + e.amount, 0);

    // UIF: 1% capped at ZAR 177.12/month (2026 ceiling ~ZAR 17712 monthly remuneration)
    const uif = Math.min(gross * 0.01, 177.12);

    // Simplified PAYE: graduated on annual equivalent
    const annual = taxableEarnings * 12;
    let annualTax = 0;
    if (annual <= 237100) annualTax = annual * 0.18;
    else if (annual <= 370500) annualTax = 42678 + (annual - 237100) * 0.26;
    else if (annual <= 512800) annualTax = 77362 + (annual - 370500) * 0.31;
    else if (annual <= 673000) annualTax = 121475 + (annual - 512800) * 0.36;
    else if (annual <= 857900) annualTax = 179147 + (annual - 673000) * 0.39;
    else if (annual <= 1817000) annualTax = 251258 + (annual - 857900) * 0.41;
    else annualTax = 644489 + (annual - 1817000) * 0.45;
    // Primary rebate 2026: R17 235
    annualTax = Math.max(0, annualTax - 17235);
    const monthlyTax = annualTax / 12;

    const lines: { label: string; amount: number; type: "earning" | "deduction" }[] = [];
    for (const e of earnings) lines.push({ label: e.name, amount: e.amount, type: "earning" });
    lines.push({ label: "PAYE Income Tax", amount: Math.round(monthlyTax * 100) / 100, type: "deduction" });
    lines.push({ label: "UIF (Employee 1%)", amount: Math.round(uif * 100) / 100, type: "deduction" });

    let totalOtherDed = 0;
    for (const d of deductions) {
      if (d.statutory) continue;
      const amt = d.override_amount ?? (d.calc_type === "percentage" ? gross * d.rate / 100 : d.rate);
      lines.push({ label: d.name, amount: Math.round(amt * 100) / 100, type: "deduction" });
      totalOtherDed += amt;
    }

    const totalDed = monthlyTax + uif + totalOtherDed;
    const net = gross - totalDed;

    insertPayslip.run(
      run.lastInsertRowid, emp.id,
      Math.round(gross * 100) / 100,
      Math.round(monthlyTax * 100) / 100,
      Math.round(uif * 100) / 100,
      Math.round(totalDed * 100) / 100,
      Math.round(net * 100) / 100,
      JSON.stringify(lines)
    );
  }

  // ── ATS: job postings ─────────────────────────────────────────────────────
  const insertJob = db.prepare(`
    INSERT INTO job_postings (title, department_id, location, description, requirements, employment_type, status, posted_at, closes_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const job1 = insertJob.run(
    "Senior Software Engineer", 2, "Cape Town / Remote",
    "Join our Engineering team to build scalable backend services. You will own critical infrastructure and mentor junior engineers.",
    "5+ years backend experience. Proficient in TypeScript/Node.js. PostgreSQL experience. Strong system design skills.",
    "full_time", "open", "2026-05-15", "2026-07-31", 2
  );
  const job2 = insertJob.run(
    "Account Executive — Enterprise", 3, "Johannesburg",
    "Drive enterprise sales cycles from qualification to close. Work with the head of Sales to target mid-market and enterprise customers.",
    "3+ years B2B SaaS sales. Consistent track record of quota achievement. Excellent communication skills.",
    "full_time", "open", "2026-05-20", "2026-07-15", 3
  );
  const job3 = insertJob.run(
    "HR Business Partner", 4, "Johannesburg",
    "Partner with department heads to deliver HR strategy, manage employee relations, and drive engagement initiatives.",
    "3+ years HRBP experience. Degree in HR Management or Industrial Psychology. Strong ER background.",
    "full_time", "draft", null, null, 4
  );

  // ── ATS: candidates & applications ───────────────────────────────────────
  const insertCand = db.prepare("INSERT INTO candidates (first_name, last_name, email, phone, cv_filename, source) VALUES (?, ?, ?, ?, ?, ?)");
  const insertApp = db.prepare(`
    INSERT INTO applications (job_posting_id, candidate_id, stage, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const insertIntv = db.prepare(`
    INSERT INTO interviews (application_id, scheduled_at, duration_minutes, format, interviewer_ids, notes, rating, feedback_submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const c1 = insertCand.run("Lethabo", "Moyo", "lethabo.moyo@email.com", "+27 83 111 0001", "lethabo_moyo_cv.pdf", "linkedin");
  const c2 = insertCand.run("Ryan", "Peters", "ryan.peters@gmail.com", "+27 71 222 0002", "ryan_peters_cv.pdf", "indeed");
  const c3 = insertCand.run("Fatima", "Hassan", "fatima.hassan@proton.me", "+27 82 333 0003", "fatima_hassan_cv.pdf", "direct");
  const c4 = insertCand.run("Andile", "Cele", "andile.cele@outlook.com", "+27 79 444 0004", "andile_cele_cv.pdf", "referral");
  const c5 = insertCand.run("Jessica", "Swart", "jessica.swart@email.com", "+27 83 555 0005", "jessica_swart_cv.pdf", "linkedin");

  // Applications for job1 (Senior SWE)
  const a1 = insertApp.run(job1.lastInsertRowid, c1.lastInsertRowid, "interview", "Strong background in distributed systems", "2026-05-20 09:00:00", "2026-06-01 14:00:00");
  const a2 = insertApp.run(job1.lastInsertRowid, c2.lastInsertRowid, "screening", null, "2026-05-22 10:30:00", "2026-05-22 10:30:00");
  const a3 = insertApp.run(job1.lastInsertRowid, c3.lastInsertRowid, "applied", null, "2026-06-10 08:00:00", "2026-06-10 08:00:00");
  // Applications for job2 (AE)
  const a4 = insertApp.run(job2.lastInsertRowid, c4.lastInsertRowid, "offer", "Excellent sales track record, enthusiastic about the role", "2026-05-25 11:00:00", "2026-06-12 09:00:00");
  const a5 = insertApp.run(job2.lastInsertRowid, c5.lastInsertRowid, "rejected", null, "2026-05-28 14:00:00", "2026-06-05 10:00:00");

  // Interview for a1
  insertIntv.run(a1.lastInsertRowid, "2026-06-01 10:00:00", 60, "video",
    JSON.stringify([2, 6]), "Strong technical depth. Good culture fit. Recommend progressing.", 4, "2026-06-01 12:00:00");

  // Offer for a4
  const insertOffer = db.prepare("INSERT INTO offers (application_id, salary, start_date, expiry_date, status, notes) VALUES (?, ?, ?, ?, ?, ?)");
  insertOffer.run(a4.lastInsertRowid, 70000, "2026-08-01", "2026-07-01", "sent", "Package includes 20% commission on target earnings");

  // ── Onboarding: default template ─────────────────────────────────────────
  const insertTemplate = db.prepare("INSERT INTO onboarding_templates (name, description) VALUES (?, ?)");
  const tpl = insertTemplate.run("Standard Onboarding", "Default onboarding checklist for all new employees");

  const insertTplTask = db.prepare(`
    INSERT INTO onboarding_template_tasks (template_id, title, description, assignee_type, due_offset_days, order_index)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insertTplTask.run(tpl.lastInsertRowid, "Send welcome email", "Send personalised welcome email with first-day logistics", "hr", -3, 1);
  insertTplTask.run(tpl.lastInsertRowid, "Prepare workstation & equipment", "Laptop, monitor, keyboard, mouse ready at desk by day 1", "it", -1, 2);
  insertTplTask.run(tpl.lastInsertRowid, "Set up system access", "Create AD account, email, Slack, GitHub, and relevant SaaS tool access", "it", 0, 3);
  insertTplTask.run(tpl.lastInsertRowid, "Complete personal information on HRCore", "Update profile, emergency contact, banking details", "new_hire", 1, 4);
  insertTplTask.run(tpl.lastInsertRowid, "Sign employment contract", "Review and sign the employment contract via e-signature", "new_hire", 1, 5);
  insertTplTask.run(tpl.lastInsertRowid, "Meet your manager — day 1 check-in", "30-min orientation call to cover role expectations, 90-day plan, and team intro", "manager", 0, 6);
  insertTplTask.run(tpl.lastInsertRowid, "Introduce to the team", "Send Slack introduction and arrange team lunch or virtual coffee", "manager", 1, 7);
  insertTplTask.run(tpl.lastInsertRowid, "Complete HR orientation training", "Watch HR policies overview video and confirm policies read", "new_hire", 3, 8);
  insertTplTask.run(tpl.lastInsertRowid, "Assign buddy", "Pair new hire with an experienced team member as buddy", "hr", 0, 9);
  insertTplTask.run(tpl.lastInsertRowid, "1-week check-in with manager", "Brief conversation covering first-week experience and any concerns", "manager", 7, 10);
  insertTplTask.run(tpl.lastInsertRowid, "30-day probation check-in", "Formal 30-day review to assess progress and set 60-day goals", "manager", 30, 11);

  // ── Onboarding: instance for Zanele (EMP009, recent hire Nov 2025) ────────
  const insertInstance = db.prepare("INSERT INTO onboarding_instances (employee_id, template_id) VALUES (?, ?)");
  const inst = insertInstance.run(9, tpl.lastInsertRowid);

  const templateTasks = db.prepare("SELECT * FROM onboarding_template_tasks WHERE template_id = ? ORDER BY order_index").all(tpl.lastInsertRowid) as {
    id: number; title: string; description: string; assignee_type: string; due_offset_days: number; order_index: number
  }[];
  const insertTask = db.prepare(`
    INSERT INTO onboarding_tasks (instance_id, template_task_id, title, description, assignee_type, assigned_to_id, due_date, status, completed_at, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const zaneleStart = "2025-11-03";
  const statuses = ["completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "in_progress", "pending"];
  const completedDates = ["2025-10-31", "2025-11-02", "2025-11-03", "2025-11-04", "2025-11-04", "2025-11-03", "2025-11-04", "2025-11-06", "2025-11-03", null, null];
  for (let i = 0; i < templateTasks.length; i++) {
    const t = templateTasks[i];
    const dueDate = new Date(zaneleStart);
    dueDate.setDate(dueDate.getDate() + t.due_offset_days);
    // Assign HR tasks to Lerato (4), IT to Dan (8), manager tasks to Thabo (2)
    const assignedTo = t.assignee_type === "hr" ? 4 : t.assignee_type === "it" ? 8 : t.assignee_type === "manager" ? 2 : null;
    insertTask.run(
      inst.lastInsertRowid, t.id, t.title, t.description, t.assignee_type,
      assignedTo, dueDate.toISOString().slice(0, 10),
      statuses[i], completedDates[i], t.order_index
    );
  }
}

export function logAudit(actorId: number | null, action: string, entity: string, entityId: number | null, detail?: string) {
  getDb()
    .prepare("INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(actorId, action, entity, entityId, detail ?? null);
}
