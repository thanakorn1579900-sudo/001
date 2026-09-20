import { getExamEnabled } from "@/db/repository";
import { examSubjects } from "@/lib/exam-subjects";
import { listUploadedExamSummaries } from "@/lib/uploaded-exams";

export const runtime = "edge";

export async function GET() {
  if (!(await getExamEnabled())) return Response.json({ error: "ระบบสอบยังไม่เปิด" }, { status: 423 });
  try {
    return Response.json({ subjects: [...examSubjects, ...await listUploadedExamSummaries()] });
  } catch {
    return Response.json({ error: "ยังโหลดรายวิชาไม่ได้" }, { status: 503 });
  }
}
