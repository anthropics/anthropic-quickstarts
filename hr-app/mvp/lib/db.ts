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

export function logAudit(actorId: number | null, action: string, entity: string, entityId: number | null, detail?: string) {
  getDb()
    .prepare("INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(actorId, action, entity, entityId, detail ?? null);
}
