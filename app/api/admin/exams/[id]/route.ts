import { hasAdminSession } from "@/lib/admin-session";
import { deleteUploadedExam, getUploadedExamForAdmin, normalizeUploadedQuestions, updateUploadedExam, uploadsBucket } from "@/lib/uploaded-exams";

export const runtime = "edge";

type Context = { params: Promise<{ id: string }> };

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

async function adminExam(request: Request, context: Context) {
  if (!(await hasAdminSession(request))) return { error: Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 }) };
  const { id } = await context.params;
  const exam = await getUploadedExamForAdmin(id);
  if (!exam) return { error: Response.json({ error: "ไม่พบชุดข้อสอบ" }, { status: 404 }) };
  return { exam };
}

export async function GET(request: Request, context: Context) {
  try {
    const result = await adminExam(request, context);
    return result.error ?? Response.json({ exam: result.exam });
  } catch {
    return Response.json({ error: "ยังโหลดข้อสอบไม่ได้" }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const result = await adminExam(request, context);
    if (result.error) return result.error;
    const body = await request.json() as { title?: unknown; description?: unknown; questions?: unknown };
    const title = cleanText(body.title, 160) || result.exam.title;
    const description = cleanText(body.description, 320) || result.exam.description;
    const questions = normalizeUploadedQuestions(body.questions);
    if (!questions) return Response.json({ error: "กรุณากรอกคำถาม ตัวเลือกอย่างน้อย 2 ตัวเลือก และเฉลยให้ครบทุกข้อ" }, { status: 400 });
    await updateUploadedExam({ id: result.exam.id, title, description, questions });
    return Response.json({ exam: { id: result.exam.id, title, description, questionCount: questions.length }, message: "บันทึกการแก้ไขข้อสอบแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถบันทึกการแก้ไขข้อสอบได้" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const result = await adminExam(request, context);
    if (result.error) return result.error;
    await uploadsBucket().delete(result.exam.sourceObjectKey);
    await deleteUploadedExam(result.exam.id);
    return Response.json({ message: "ลบชุดข้อสอบแล้ว" });
  } catch {
    return Response.json({ error: "ไม่สามารถลบชุดข้อสอบได้" }, { status: 400 });
  }
}
