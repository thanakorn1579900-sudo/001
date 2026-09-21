import { env } from "cloudflare:workers";

export type TeacherStatus = "pending" | "approved" | "rejected";
export type Teacher = { id: string; name: string; email: string; status: TeacherStatus; createdAt: string; approvedAt: string | null };
type TeacherLogin = Teacher & { passwordHash: string; passwordSalt: string };

function database() {
  if (!env.DB) throw new Error("ไม่พบฐานข้อมูลของระบบสอบ");
  return env.DB;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 160);
}

export async function createTeacher(input: { name: string; email: string; passwordHash: string; passwordSalt: string }) {
  const id = `teacher-${crypto.randomUUID()}`;
  await database().prepare(
    "INSERT INTO teacher_accounts (id, name, email, password_hash, password_salt, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)",
  ).bind(id, input.name, normalizeEmail(input.email), input.passwordHash, input.passwordSalt).run();
  return id;
}

export async function findTeacherForLogin(email: string) {
  return database().prepare(
    "SELECT id, name, email, status, created_at AS createdAt, approved_at AS approvedAt, password_hash AS passwordHash, password_salt AS passwordSalt FROM teacher_accounts WHERE email = ? LIMIT 1",
  ).bind(normalizeEmail(email)).first<TeacherLogin>();
}

export async function getTeacher(id: string) {
  return database().prepare(
    "SELECT id, name, email, status, created_at AS createdAt, approved_at AS approvedAt FROM teacher_accounts WHERE id = ? LIMIT 1",
  ).bind(id).first<Teacher>();
}

export async function listTeachers(status?: TeacherStatus) {
  const query = status
    ? database().prepare("SELECT id, name, email, status, created_at AS createdAt, approved_at AS approvedAt FROM teacher_accounts WHERE status = ? ORDER BY created_at DESC").bind(status)
    : database().prepare("SELECT id, name, email, status, created_at AS createdAt, approved_at AS approvedAt FROM teacher_accounts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC");
  const result = await query.all<Teacher>();
  return result.results ?? [];
}

export async function setTeacherStatus(id: string, status: Extract<TeacherStatus, "approved" | "rejected">) {
  const result = await database().prepare(
    "UPDATE teacher_accounts SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
  ).bind(status, status, id).run();
  return result.meta.changes === 1;
}
