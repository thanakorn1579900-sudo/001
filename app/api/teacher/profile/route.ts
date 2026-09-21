import { hashTeacherPassword, teacherSessionId, verifyTeacherPassword } from "@/lib/teacher-auth";
import { findTeacherForLogin, getTeacher, updateTeacherName, updateTeacherPassword } from "@/lib/teacher-accounts";

export const runtime = "edge";

function safeTeacher(teacher: { id: string; name: string; email: string; examEnabled: boolean }) {
  return { id: teacher.id, name: teacher.name, email: teacher.email, examEnabled: teacher.examEnabled };
}

export async function PATCH(request: Request) {
  try {
    const id = await teacherSessionId(request);
    if (!id) return Response.json({ error: "กรุณาเข้าสู่ระบบครู" }, { status: 401 });
    const teacher = await getTeacher(id);
    if (!teacher || teacher.status !== "approved") return Response.json({ error: "บัญชีครูไม่มีสิทธิ์ใช้งาน" }, { status: 403 });

    const body = await request.json() as { name?: unknown; currentPassword?: unknown; newPassword?: unknown };
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!name) return Response.json({ error: "กรุณาระบุชื่อครู" }, { status: 400 });
    if (newPassword && (newPassword.length < 8 || newPassword.length > 160)) return Response.json({ error: "รหัสผ่านใหม่ต้องมี 8–160 ตัวอักษร" }, { status: 400 });

    if (newPassword) {
      const loginTeacher = await findTeacherForLogin(teacher.email);
      if (!currentPassword || !loginTeacher || !(await verifyTeacherPassword(currentPassword, loginTeacher.passwordSalt, loginTeacher.passwordHash))) {
        return Response.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 401 });
      }
      const credentials = await hashTeacherPassword(newPassword);
      if (!(await updateTeacherPassword(id, credentials.hash, credentials.salt))) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
    }

    if (!(await updateTeacherName(id, name))) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
    const updated = await getTeacher(id);
    if (!updated) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
    return Response.json({ teacher: safeTeacher(updated), message: newPassword ? "บันทึกชื่อและรหัสผ่านใหม่แล้ว" : "บันทึกชื่อครูแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถบันทึกข้อมูลบัญชีครูได้" }, { status: 400 });
  }
}
