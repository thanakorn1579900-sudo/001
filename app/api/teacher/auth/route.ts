import { findTeacherForLogin, getTeacher } from "@/lib/teacher-accounts";
import { createTeacherSession, teacherSessionCookie, teacherSessionId, teacherSessionSeconds, verifyTeacherPassword } from "@/lib/teacher-auth";

export const runtime = "edge";

function safeTeacher(teacher: { id: string; name: string; email: string }) {
  return { id: teacher.id, name: teacher.name, email: teacher.email };
}

export async function GET(request: Request) {
  try {
    const id = await teacherSessionId(request);
    if (!id) return Response.json({ authenticated: false });
    const teacher = await getTeacher(id);
    if (!teacher || teacher.status !== "approved") return Response.json({ authenticated: false }, { headers: { "set-cookie": teacherSessionCookie("", 0) } });
    return Response.json({ authenticated: true, teacher: safeTeacher(teacher) });
  } catch {
    return Response.json({ authenticated: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: unknown; email?: unknown; password?: unknown };
    if (body.action === "logout") return Response.json({ authenticated: false }, { headers: { "set-cookie": teacherSessionCookie("", 0) } });
    if (body.action !== "login" || typeof body.email !== "string" || typeof body.password !== "string") return Response.json({ error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง" }, { status: 400 });
    const teacher = await findTeacherForLogin(body.email);
    if (!teacher || !(await verifyTeacherPassword(body.password, teacher.passwordSalt, teacher.passwordHash))) return Response.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    if (teacher.status === "pending") return Response.json({ error: "บัญชีครูกำลังรอผู้ดูแลระบบยืนยันสิทธิ์" }, { status: 403 });
    if (teacher.status !== "approved") return Response.json({ error: "บัญชีครูยังไม่ได้รับสิทธิ์ใช้งาน" }, { status: 403 });
    const session = await createTeacherSession(teacher.id);
    return Response.json({ authenticated: true, teacher: safeTeacher(teacher) }, { headers: { "set-cookie": teacherSessionCookie(session, teacherSessionSeconds) } });
  } catch {
    return Response.json({ error: "ไม่สามารถเข้าสู่ระบบครูได้" }, { status: 400 });
  }
}
