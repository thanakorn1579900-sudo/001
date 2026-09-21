import { hasAdminSession } from "@/lib/admin-session";
import { listTeachers, setTeacherStatus } from "@/lib/teacher-accounts";

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
