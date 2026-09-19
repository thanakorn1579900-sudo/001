import { env } from "cloudflare:workers";

export type StudentProfile = {
  name: string;
  classLevel: string;
  studentId: string;
};

function database() {
  if (!env.DB) throw new Error("ไม่พบฐานข้อมูลของระบบสอบ");
  return env.DB;
}

export async function getStudentProfile(userId: string) {
  return database()
    .prepare(
      "SELECT name, class_level AS classLevel, student_id AS studentId FROM student_profiles WHERE user_id = ? LIMIT 1",
    )
    .bind(userId)
    .first<StudentProfile>();
}

export async function createStudentProfile(input: {
  userId: string;
  email: string;
  name: string;
  classLevel: string;
  studentId: string;
}) {
  return database()
    .prepare(
      "INSERT INTO student_profiles (user_id, name, class_level, student_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    )
    .bind(input.userId, input.name, input.classLevel, input.studentId, input.email)
    .run();
}

export async function isAdmin(userId: string) {
  const row = await database()
    .prepare("SELECT 1 AS present FROM admin_users WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<{ present: number }>();
  return Boolean(row?.present);
}

export async function getExamEnabled() {
  const row = await database()
    .prepare("SELECT value FROM app_settings WHERE key = 'exam_enabled' LIMIT 1")
    .first<{ value: string }>();
  return row?.value === "true";
}

export async function bootstrapFirstAdmin(userId: string, email: string) {
  const lock = await database()
    .prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_initialized', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING")
    .run();

  if (lock.meta.changes !== 1) return false;

  await database()
    .prepare("INSERT INTO admin_users (user_id, email, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
    .bind(userId, email)
    .run();
  return true;
}

export async function setExamEnabled(enabled: boolean) {
  await database()
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('exam_enabled', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(enabled ? "true" : "false")
    .run();
}
