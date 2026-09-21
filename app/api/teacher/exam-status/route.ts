import { getTeacher, setTeacherExamEnabled } from "@/lib/teacher-accounts";
import { teacherSessionId } from "@/lib/teacher-auth";

export const runtime = "edge";

async function signedInTeacher(request: Request) {
  const id = await teacherSessionId(request);
  const teacher = id ? await getTeacher(id) : null;
  return teacher?.status === "approved" ? teacher : null;
}

export async function GET(request: Request) {
  try {
    const teacher = await signedInTeacher(request);
    if (!teacher) return Response.json({ error: "กรุณาเข้าสู่ระบบครู" }, { status: 401 });
    return Response.json({ examEnabled: teacher.examEnabled });
  } catch {
    return Response.json({ error: "ยังตรวจสอบสถานะข้อสอบไม่ได้" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const teacher = await signedInTeacher(request);
    if (!teacher) return Response.json({ error: "กรุณาเข้าสู่ระบบครู" }, { status: 401 });
    const body = await request.json() as { examEnabled?: unknown };
    if (typeof body.examEnabled !== "boolean") return Response.json({ error: "ระบุสถานะข้อสอบไม่ถูกต้อง" }, { status: 400 });
    if (!(await setTeacherExamEnabled(teacher.id, body.examEnabled))) return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะข้อสอบได้" }, { status: 400 });
    return Response.json({ examEnabled: body.examEnabled, message: body.examEnabled ? "เปิดข้อสอบให้นักเรียนแล้ว" : "ปิดข้อสอบของคุณแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะข้อสอบได้" }, { status: 400 });
  }
}
