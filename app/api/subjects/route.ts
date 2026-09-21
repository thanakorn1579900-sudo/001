import { getExamEnabled } from "@/db/repository";
import { listCatalogExams } from "@/lib/catalog-exam-overrides";
import { listUploadedExamSummaries } from "@/lib/uploaded-exams";
import { ensureThanakornTeacher, getTeacher, THANAKORN_TEACHER_ID } from "@/lib/teacher-accounts";

export const runtime = "edge";

export async function GET(request: Request) {
  if (!(await getExamEnabled())) return Response.json({ error: "ระบบสอบยังไม่เปิด" }, { status: 423 });
  try {
    await ensureThanakornTeacher();
    const requestedTeacherId = new URL(request.url).searchParams.get("teacher")?.trim().slice(0, 100) || THANAKORN_TEACHER_ID;
    const teacherId = requestedTeacherId === "system" ? THANAKORN_TEACHER_ID : requestedTeacherId;
    const teacher = await getTeacher(teacherId);
    if (!teacher || teacher.status !== "approved" || !teacher.examEnabled) return Response.json({ error: "ครูท่านนี้ยังไม่เปิดข้อสอบ" }, { status: 423 });
    const uploaded = await listUploadedExamSummaries(teacherId);
    return Response.json({ subjects: teacherId === THANAKORN_TEACHER_ID ? [...await listCatalogExams(), ...uploaded] : uploaded });
  } catch {
    return Response.json({ error: "ยังโหลดรายวิชาไม่ได้" }, { status: 503 });
  }
}
