import { env } from "cloudflare:workers";
import { hashTeacherPassword } from "@/lib/teacher-auth";

export type TeacherStatus = "pending" | "approved" | "rejected";
export type Teacher = { id: string; name: string; email: string; status: TeacherStatus; examEnabled: boolean; createdAt: string; approvedAt: string | null };
type TeacherLogin = Teacher & { passwordHash: string; passwordSalt: string };
type TeacherRow = Omit<Teacher, "examEnabled"> & { examEnabled: number };
type TeacherLoginRow = Omit<TeacherLogin, "examEnabled"> & { examEnabled: number };

export const THANAKORN_TEACHER_ID = "teacher-thanakorn";
export const THANAKORN_TEACHER_NAME = "ครูธนากร สมปาน";
export const THANAKORN_TEACHER_EMAIL = "thanakorn.s@ctc.ac.th";

function database() {
  if (!env.DB) throw new Error("ไม่พบฐานข้อมูลของระบบสอบ");
  return env.DB;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 160);
}

function toTeacher(row: TeacherRow): Teacher {
  return { ...row, examEnabled: Boolean(row.examEnabled) };
}

function toTeacherLogin(row: TeacherLoginRow): TeacherLogin {
  return { ...row, examEnabled: Boolean(row.examEnabled) };
}

const teacherFields = "id, name, email, status, exam_enabled AS examEnabled, created_at AS createdAt, approved_at AS approvedAt";

/**
 * Creates the initial teacher account only from a hosted secret, then moves the
 * former shared teacher's uploaded exams into that teacher's own workspace.
 */
export async function ensureThanakornTeacher() {
  const existing = await getTeacher(THANAKORN_TEACHER_ID);
  if (existing) {
    await database().prepare("UPDATE uploaded_exams SET teacher_id = ? WHERE teacher_id = 'system'").bind(existing.id).run();
    return existing;
  }

  const initialPassword = process.env.THANAKORN_TEACHER_INITIAL_PASSWORD;
  if (!initialPassword) return null;

  const credentials = await hashTeacherPassword(initialPassword);
  await database().prepare(
    "INSERT INTO teacher_accounts (id, name, email, password_hash, password_salt, status, exam_enabled, created_at, approved_at) VALUES (?, ?, ?, ?, ?, 'approved', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING",
  ).bind(THANAKORN_TEACHER_ID, THANAKORN_TEACHER_NAME, THANAKORN_TEACHER_EMAIL, credentials.hash, credentials.salt).run();

  const teacher = await getTeacher(THANAKORN_TEACHER_ID);
  if (!teacher) return null;
  await database().prepare("UPDATE uploaded_exams SET teacher_id = ? WHERE teacher_id = 'system'").bind(teacher.id).run();
  return teacher;
}

export async function createTeacher(input: { name: string; email: string; passwordHash: string; passwordSalt: string }) {
  const id = `teacher-${crypto.randomUUID()}`;
  await database().prepare(
    "INSERT INTO teacher_accounts (id, name, email, password_hash, password_salt, status, exam_enabled, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)",
  ).bind(id, input.name, normalizeEmail(input.email), input.passwordHash, input.passwordSalt).run();
  return id;
}

export async function findTeacherForLogin(email: string) {
  const row = await database().prepare(
    `SELECT ${teacherFields}, password_hash AS passwordHash, password_salt AS passwordSalt FROM teacher_accounts WHERE email = ? LIMIT 1`,
  ).bind(normalizeEmail(email)).first<TeacherLoginRow>();
  return row ? toTeacherLogin(row) : null;
}

export async function getTeacher(id: string) {
  const row = await database().prepare(
    `SELECT ${teacherFields} FROM teacher_accounts WHERE id = ? LIMIT 1`,
  ).bind(id).first<TeacherRow>();
  return row ? toTeacher(row) : null;
}

export async function listTeachers(status?: TeacherStatus) {
  const query = status
    ? database().prepare(`SELECT ${teacherFields} FROM teacher_accounts WHERE status = ? ORDER BY created_at DESC`).bind(status)
    : database().prepare(`SELECT ${teacherFields} FROM teacher_accounts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`);
  const result = await query.all<TeacherRow>();
  return (result.results ?? []).map(toTeacher);
}

export async function listOpenTeachers() {
  const result = await database().prepare(
    `SELECT ${teacherFields} FROM teacher_accounts WHERE status = 'approved' AND exam_enabled = 1 ORDER BY name COLLATE NOCASE ASC`,
  ).all<TeacherRow>();
  return (result.results ?? []).map(toTeacher);
}

export async function setTeacherStatus(id: string, status: Extract<TeacherStatus, "approved" | "rejected">) {
  const result = await database().prepare(
    "UPDATE teacher_accounts SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
  ).bind(status, status, id).run();
  return result.meta.changes === 1;
}

export async function setTeacherExamEnabled(id: string, enabled: boolean) {
  const result = await database().prepare(
    "UPDATE teacher_accounts SET exam_enabled = ? WHERE id = ? AND status = 'approved'",
  ).bind(enabled ? 1 : 0, id).run();
  return result.meta.changes === 1;
}

export async function updateTeacherName(id: string, name: string) {
  const result = await database().prepare(
    "UPDATE teacher_accounts SET name = ? WHERE id = ?",
  ).bind(name, id).run();
  return result.meta.changes === 1;
}

export async function updateTeacherPassword(id: string, passwordHash: string, passwordSalt: string) {
  const result = await database().prepare(
    "UPDATE teacher_accounts SET password_hash = ?, password_salt = ? WHERE id = ?",
  ).bind(passwordHash, passwordSalt, id).run();
  return result.meta.changes === 1;
}
