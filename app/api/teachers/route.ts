import { createTeacher, ensureThanakornTeacher, listOpenTeachers, normalizeEmail } from "@/lib/teacher-accounts";
import { hashTeacherPassword } from "@/lib/teacher-auth";

export const runtime = "edge";

const clean = (value: unknown, maxLength: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";

export async function GET() {
  try {
    await ensureThanakornTeacher();
    const teachers = await listOpenTeachers();
    return Response.json({ teachers: teachers.map(({ id, name }) => ({ id, name })) });
  } catch {
    return Response.json({ error: "ยังโหลดรายชื่อครูไม่ได้" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; email?: unknown; password?: unknown };
    const name = clean(body.name, 120);
    const email = normalizeEmail(clean(body.email, 160));
    const password = typeof body.password === "string" ? body.password : "";
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "กรอกชื่อและอีเมลให้ถูกต้อง" }, { status: 400 });
    if (password.length < 8 || password.length > 160) return Response.json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
    const credentials = await hashTeacherPassword(password);
    await createTeacher({ name, email, passwordHash: credentials.hash, passwordSalt: credentials.salt });
    return Response.json({ message: "ส่งคำขอสมัครครูแล้ว รอผู้ดูแลระบบยืนยันสิทธิ์ก่อนเข้าสู่ระบบ" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && /unique|constraint/i.test(error.message) ? "อีเมลนี้สมัครไว้แล้ว" : "ไม่สามารถส่งคำขอสมัครได้";
    return Response.json({ error: message }, { status: 400 });
  }
}
