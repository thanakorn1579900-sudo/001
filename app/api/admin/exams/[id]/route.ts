import { hasAdminSession } from "@/lib/admin-session";
import { parseExamUpload } from "@/lib/exam-upload-parser";
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
    const body = await request.json() as { action?: unknown; title?: unknown; description?: unknown; questions?: unknown };
    if (body.action === "reprocess") {
      const source = await uploadsBucket().get(result.exam.sourceObjectKey);
      if (!source) return Response.json({ error: "ไม่พบไฟล์ต้นฉบับสำหรับประมวลผลใหม่" }, { status: 404 });
      const parsed = await parseExamUpload(result.exam.sourceFileName, await source.arrayBuffer());
      if (!parsed.questions.length) return Response.json({ error: "ตรวจพบโจทย์ แต่ยังไม่พบข้อที่มีตัวเลือกและเฉลยครบ กรุณาแก้ไขในหน้าแอดมิน" }, { status: 400 });
      await updateUploadedExam({ id: result.exam.id, title: result.exam.title, description: result.exam.description, questions: parsed.questions });
      const missed = parsed.diagnostics.incomplete.length
        ? ` ยังมีข้อที่ต้องตรวจ ${parsed.diagnostics.incomplete.slice(0, 8).join(", ")}${parsed.diagnostics.incomplete.length > 8 ? "…" : ""}`
        : "";
      return Response.json({
        exam: { id: result.exam.id, title: result.exam.title, description: result.exam.description, questionCount: parsed.questions.length },
        message: `อ่านไฟล์ต้นฉบับใหม่แล้ว พบข้อสอบ ${parsed.questions.length} ข้อ${missed}`,
      });
    }
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
