import { hasAdminSession } from "@/lib/admin-session";
import { hashTeacherPassword } from "@/lib/teacher-auth";
import { listTeachers, setTeacherStatus, updateTeacherName, updateTeacherPassword } from "@/lib/teacher-accounts";

export const runtime = "edge";

export async function GET(request: Request) {
  if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
  try {
    return Response.json({ teachers: await listTeachers() });
  } catch {
    return Response.json({ error: "ยังโหลดคำขอสมัครครูไม่ได้" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    const id = typeof body.id === "string" ? body.id.slice(0, 100) : "";
    const status = body.status === "approved" || body.status === "rejected" ? body.status : "";
    if (!id || !status) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
    if (!(await setTeacherStatus(id, status))) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
    return Response.json({ message: status === "approved" ? "อนุมัติสิทธิ์ครูแล้ว" : "ไม่อนุมัติคำขอสมัครครูแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถบันทึกสิทธิ์ครูได้" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown; id?: unknown; name?: unknown };
    const id = typeof body.id === "string" ? body.id.trim().slice(0, 100) : "";
    if (!id) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });

    if (body.action === "rename") {
      const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
      if (!name) return Response.json({ error: "กรุณาระบุชื่อครู" }, { status: 400 });
      if (!(await updateTeacherName(id, name))) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
      return Response.json({ message: "แก้ไขชื่อครูแล้ว" });
    }

    if (body.action === "resetPassword") {
      const resetPassword = process.env.TEACHER_RESET_PASSWORD;
      if (!resetPassword) return Response.json({ error: "ยังไม่ได้ตั้งค่ารหัสผ่านเริ่มต้นสำหรับการรีเซ็ต" }, { status: 503 });
      const credentials = await hashTeacherPassword(resetPassword);
      if (!(await updateTeacherPassword(id, credentials.hash, credentials.salt))) return Response.json({ error: "ไม่พบบัญชีครู" }, { status: 404 });
      return Response.json({ message: "รีเซ็ตรหัสผ่านครูเป็นค่าเริ่มต้นแล้ว" });
    }

    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  } catch {
    return Response.json({ error: "ไม่สามารถจัดการบัญชีครูได้" }, { status: 400 });
  }
}
