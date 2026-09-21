import { getExamEnabled } from "@/db/repository";
import { examSubjects } from "@/lib/exam-subjects";
import { listUploadedExamSummaries } from "@/lib/uploaded-exams";

export const runtime = "edge";

export async function GET(request: Request) {
  if (!(await getExamEnabled())) return Response.json({ error: "ระบบสอบยังไม่เปิด" }, { status: 423 });
  try {
    const teacherId = new URL(request.url).searchParams.get("teacher")?.trim().slice(0, 100) || "system";
    const uploaded = await listUploadedExamSummaries(teacherId);
    return Response.json({ subjects: teacherId === "system" ? [...examSubjects, ...uploaded] : uploaded });
  } catch {
    return Response.json({ error: "ยังโหลดรายวิชาไม่ได้" }, { status: 503 });
  }
}
