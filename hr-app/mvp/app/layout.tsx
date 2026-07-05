import type { Metadata } from "next";
import "./globals.css";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import NavLink from "@/components/NavLink";
import UserSwitcher from "@/components/UserSwitcher";

export const metadata: Metadata = {
  title: "HRCore",
  description: "HR platform MVP — Core HR, Leave, Time & Attendance",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const user = getCurrentUser();
  const users = (
    db.prepare("SELECT id, first_name || ' ' || last_name AS name, role FROM employees WHERE status = 'active' ORDER BY id").all() as {
      id: number;
      name: string;
      role: string;
    }[]
  );

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white p-4 md:flex md:flex-col">
            <div className="mb-6 flex items-center gap-2 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">H</div>
              <span className="text-lg font-bold">HRCore</span>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              <NavLink href="/" label="Dashboard" icon="🏠" />
              <p className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">People</p>
              <NavLink href="/employees" label="Employees" icon="👤" />
              <NavLink href="/org-chart" label="Org Chart" icon="🌳" />
              <p className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Workforce</p>
              <NavLink href="/leave" label="Leave" icon="📅" />
              <NavLink href="/time" label="Time & Attendance" icon="⏱️" />
              <p className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Talent</p>
              <NavLink href="/recruitment" label="Recruitment" icon="🎯" />
              <NavLink href="/onboarding" label="Onboarding" icon="🚀" />
              <NavLink href="/performance" label="Performance" icon="📊" />
              <p className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Finance</p>
              <NavLink href="/payroll" label="Payroll" icon="💰" />
              <NavLink href="/expenses" label="Expenses" icon="💸" />
              <NavLink href="/benefits" label="Benefits" icon="💼" />
            </nav>
            <div className="mt-auto border-t border-gray-100 pt-3 text-xs text-gray-400">
              HRCore MVP · v0.1
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
              <div className="text-sm text-gray-500">
                Acme (Pty) Ltd
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-gray-600 sm:block">
                  {user.first_name} {user.last_name} · <span className="capitalize">{user.role}</span>
                </span>
                <UserSwitcher users={users} currentId={user.id} />
              </div>
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
