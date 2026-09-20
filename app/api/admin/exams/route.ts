import { hasAdminSession } from "@/lib/admin-session";
import { parseExamUpload } from "@/lib/exam-upload-parser";
import { listUploadedExamSummaries, saveUploadedExam, uploadsBucket } from "@/lib/uploaded-exams";

export const runtime = "edge";

const maximumFileSize = 5 * 1024 * 1024;

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function fileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "uploaded-exam";
}

export async function GET(request: Request) {
  if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
  try {
    return Response.json({ exams: await listUploadedExamSummaries() });
  } catch {
    return Response.json({ error: "ยังโหลดรายการข้อสอบที่อัปโหลดไม่ได้" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return Response.json({ error: "กรุณาเลือกไฟล์ข้อสอบ" }, { status: 400 });
    if (!file.size) return Response.json({ error: "ไฟล์ข้อสอบว่างเปล่า" }, { status: 400 });
    if (file.size > maximumFileSize) return Response.json({ error: "ไฟล์มีขนาดเกิน 5 MB" }, { status: 400 });

    const parsed = await parseExamUpload(file.name, await file.arrayBuffer());
    if (!parsed.questions.length) {
      const found = parsed.diagnostics.candidates;
      return Response.json({ error: found ? `ตรวจพบโจทย์ ${found} ข้อ แต่ยังไม่พบข้อที่มีตัวเลือกและเฉลยครบ กรุณาตรวจรูปแบบไฟล์` : "ไม่พบโจทย์ในไฟล์ กรุณาตรวจรูปแบบไฟล์ก่อนอัปโหลด" }, { status: 400 });
    }
    if (parsed.questions.length > 200) return Response.json({ error: "หนึ่งไฟล์มีข้อสอบได้ไม่เกิน 200 ข้อ" }, { status: 400 });

    const title = cleanText(data.get("title"), 160) || parsed.suggestedTitle;
    const description = cleanText(data.get("description"), 320) || `ข้อสอบที่ประมวลผลจากไฟล์ ${file.name}`;
    const id = `uploaded-${crypto.randomUUID()}`;
    const sourceFileName = fileName(file.name);
    const sourceObjectKey = `exam-uploads/${id}/${sourceFileName}`;
    await uploadsBucket().put(sourceObjectKey, file, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await saveUploadedExam({ id, title, description, sourceFileName, sourceObjectKey, questions: parsed.questions });
    const missed = parsed.diagnostics.incomplete.length
      ? ` พบข้อที่ยังไม่ครบ ${parsed.diagnostics.incomplete.slice(0, 8).join(", ")}${parsed.diagnostics.incomplete.length > 8 ? "…" : ""} กรุณาตรวจสอบในหน้าแก้ไข`
      : "";
    return Response.json({
      exam: { id, title, description, questionCount: parsed.questions.length, sourceFileName },
      diagnostics: parsed.diagnostics,
      message: `ตรวจพบ ${parsed.diagnostics.candidates} ข้อ เพิ่มข้อสอบ ${parsed.questions.length} ข้อแล้ว ระบบจะตรวจคะแนนจากเฉลยในไฟล์โดยอัตโนมัติ${missed}`,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถประมวลผลไฟล์ข้อสอบได้";
    return Response.json({ error: message }, { status: 400 });
  }
}
