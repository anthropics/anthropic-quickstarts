# HRCore — MVP

Accelerated MVP of the HR platform described in [`../SPECIFICATION.md`](../SPECIFICATION.md), covering **Phase 1** of the [sprint backlog](../SPRINT_BACKLOG.md): Core HR, Leave & Absence, Time & Attendance, and an employee dashboard.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. The SQLite database (`hrcore.db`) is created and seeded automatically on first run — no external services required.

## Demo auth

The MVP ships with a **user switcher** in the top bar instead of real authentication. Pick any seeded employee to act as them; pages and APIs enforce role-based access (admin / hr / manager / employee) off the selected user. Clerk/SSO replaces this post-MVP — everything downstream already keys off employee id + role.

Useful personas:

| User | Role | What to try |
|---|---|---|
| Naledi Mokoena | admin | Everything |
| Lerato Dlamini | hr | Add/edit employees, leave admin, approve anyone |
| Thabo Nkosi | manager | Approve Engineering leave & timesheets, team attendance |
| Sipho Zulu | employee | Request leave, clock in/out, submit timesheet |

## Modules

| Route | Module |
|---|---|
| `/` | Dashboard — balances, clock status, who's out, announcements |
| `/employees` | Directory, profiles, add/edit (HR), search & filters |
| `/org-chart` | Reporting tree from manager relationships |
| `/leave` | My leave, balances, requests; `/leave/approvals`, `/leave/calendar`, `/leave/admin` |
| `/time` | Clock in/out, weekly timesheet, submission; `/time/team` for managers |

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · SQLite (better-sqlite3)

Server components read straight from SQLite; mutations go through route handlers under `app/api/*` which enforce roles and write to the audit log (`audit_log` table).

## Resetting demo data

```bash
rm hrcore.db && npm run dev
```
