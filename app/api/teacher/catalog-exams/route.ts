import { getCatalogExam, hideCatalogExam, listCatalogExams, restoreCatalogExam, saveCatalogExam } from "@/lib/catalog-exam-overrides";
import { isExamSubjectId } from "@/lib/exam-subjects";
import { getTeacher, THANAKORN_TEACHER_ID } from "@/lib/teacher-accounts";
import { teacherSessionId } from "@/lib/teacher-auth";
import { normalizeUploadedQuestions } from "@/lib/uploaded-exams";

export const runtime = "edge";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

async function thanakornTeacher(request: Request) {
  const id = await teacherSessionId(request);
  if (id !== THANAKORN_TEACHER_ID) return null;
  const teacher = await getTeacher(id);
  return teacher?.status === "approved" ? teacher : null;
}

export async function GET(request: Request) {
  try {
    const teacher = await thanakornTeacher(request);
    if (!teacher) return Response.json({ exams: [], canManageCatalog: false });
    return Response.json({ exams: await listCatalogExams(true), canManageCatalog: true });
  } catch {
    return Response.json({ error: "ยังโหลดข้อสอบมาตรฐานไม่ได้" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await thanakornTeacher(request))) return Response.json({ error: "ไม่มีสิทธิ์จัดการข้อสอบชุดนี้" }, { status: 403 });
    const body = await request.json() as { action?: unknown; id?: unknown; title?: unknown; description?: unknown; questions?: unknown };
    const id = clean(body.id, 120);
    if (!isExamSubjectId(id)) return Response.json({ error: "ไม่พบชุดข้อสอบ" }, { status: 404 });
    if (body.action === "restore") {
      if (!(await restoreCatalogExam(id))) return Response.json({ error: "ไม่สามารถเรียกคืนข้อสอบได้" }, { status: 400 });
      return Response.json({ message: "เรียกคืนชุดข้อสอบแล้ว" });
    }
    const title = clean(body.title, 160);
    const description = clean(body.description, 320);
    const questions = normalizeUploadedQuestions(body.questions);
    if (!title || !description || !questions?.length) return Response.json({ error: "กรอกชื่อ คำอธิบาย คำถาม ตัวเลือก และเฉลยให้ครบ" }, { status: 400 });
    await saveCatalogExam({ id, title, description, questions });
    return Response.json({ exam: await getCatalogExam(id), message: "บันทึกการแก้ไขข้อสอบแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถบันทึกการแก้ไขข้อสอบได้" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await thanakornTeacher(request))) return Response.json({ error: "ไม่มีสิทธิ์จัดการข้อสอบชุดนี้" }, { status: 403 });
    const body = await request.json() as { id?: unknown };
    const id = clean(body.id, 120);
    if (!(await hideCatalogExam(id))) return Response.json({ error: "ไม่พบชุดข้อสอบ" }, { status: 404 });
    return Response.json({ message: "ลบชุดข้อสอบออกจากหน้าสอบแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถลบชุดข้อสอบได้" }, { status: 400 });
  }
}
