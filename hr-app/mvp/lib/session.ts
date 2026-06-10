import { cookies } from "next/headers";
import { getDb } from "./db";
import type { Employee } from "./types";

const COOKIE = "hrcore_user";

/**
 * MVP auth: the "current user" is selected via a cookie set by the user
 * switcher in the top bar. Real authentication (Clerk/SSO) replaces this
 * post-MVP; everything downstream already keys off employee id + role.
 */
export function getCurrentUser(): Employee {
  const id = Number(cookies().get(COOKIE)?.value ?? "1");
  const db = getDb();
  const user = db.prepare("SELECT * FROM employees WHERE id = ?").get(id) as Employee | undefined;
  if (user) return user;
  return db.prepare("SELECT * FROM employees WHERE id = 1").get() as Employee;
}

export function canManage(user: Employee): boolean {
  return user.role === "admin" || user.role === "hr" || user.role === "manager";
}

export function isHr(user: Employee): boolean {
  return user.role === "admin" || user.role === "hr";
}
