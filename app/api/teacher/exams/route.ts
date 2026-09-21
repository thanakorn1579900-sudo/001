import { parseExamUpload } from "@/lib/exam-upload-parser";
import { teacherSessionId } from "@/lib/teacher-auth";
import { getTeacher } from "@/lib/teacher-accounts";
import { listUploadedExamSummaries, saveUploadedExam, uploadsBucket } from "@/lib/uploaded-exams";

export const runtime = "edge";
const maximumFileSize = 5 * 1024 * 1024;

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function fileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "uploaded-exam";
}

async function approvedTeacherId(request: Request) {
  const id = await teacherSessionId(request);
  const teacher = id ? await getTeacher(id) : null;
  return teacher?.status === "approved" ? teacher.id : "";
}

export async function GET(request: Request) {
  const teacherId = await approvedTeacherId(request);
  if (!teacherId) return Response.json({ error: "กรุณาเข้าสู่ระบบครู" }, { status: 401 });
  try {
    return Response.json({ exams: await listUploadedExamSummaries(teacherId) });
  } catch {
    return Response.json({ error: "ยังโหลดข้อสอบของครูไม่ได้" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const teacherId = await approvedTeacherId(request);
  if (!teacherId) return Response.json({ error: "กรุณาเข้าสู่ระบบครู" }, { status: 401 });
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return Response.json({ error: "กรุณาเลือกไฟล์ข้อสอบ" }, { status: 400 });
    if (file.size > maximumFileSize) return Response.json({ error: "ไฟล์มีขนาดเกิน 5 MB" }, { status: 400 });
    const parsed = await parseExamUpload(file.name, await file.arrayBuffer());
    if (!parsed.questions.length) return Response.json({ error: parsed.diagnostics.candidates ? `ตรวจพบโจทย์ ${parsed.diagnostics.candidates} ข้อ แต่ยังไม่พบเฉลยครบ` : "ไม่พบโจทย์ในไฟล์" }, { status: 400 });
    if (parsed.questions.length > 200) return Response.json({ error: "หนึ่งไฟล์มีข้อสอบได้ไม่เกิน 200 ข้อ" }, { status: 400 });
    const id = `uploaded-${crypto.randomUUID()}`;
    const sourceFileName = fileName(file.name);
    const sourceObjectKey = `exam-uploads/${id}/${sourceFileName}`;
    const title = cleanText(data.get("title"), 160) || parsed.suggestedTitle;
    const description = cleanText(data.get("description"), 320) || `ข้อสอบที่ประมวลผลจากไฟล์ ${file.name}`;
    await uploadsBucket().put(sourceObjectKey, file, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await saveUploadedExam({ id, title, description, sourceFileName, sourceObjectKey, teacherId, questions: parsed.questions });
    return Response.json({ exam: { id, title, description, questionCount: parsed.questions.length, sourceFileName }, message: `เพิ่มข้อสอบ ${parsed.questions.length} ข้อแล้ว` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ไม่สามารถอัปโหลดข้อสอบได้" }, { status: 400 });
  }
}
