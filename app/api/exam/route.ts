import { getExam } from "@/lib/exam-catalog";
import { defaultExamSubjectId, isExamSubjectId } from "@/lib/exam-subjects";
import { getExamEnabled } from "@/db/repository";
import { getUploadedExam } from "@/lib/uploaded-exams";
import { ensureThanakornTeacher, getTeacher, THANAKORN_TEACHER_ID, THANAKORN_TEACHER_NAME } from "@/lib/teacher-accounts";
import { after } from "next/server";

export const runtime = "edge";

type Submission = {
  subjectId?: unknown;
  name?: unknown;
  classLevel?: unknown;
  studentId?: unknown;
  answers?: unknown;
  warnings?: unknown;
  elapsedSeconds?: unknown;
  startedAt?: unknown;
  submittedAt?: unknown;
};

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const getSubjectId = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 120) : defaultExamSubjectId;

async function resolveExam(subjectId: string) {
  if (!isExamSubjectId(subjectId)) return getUploadedExam(subjectId);
  const exam = getExam(subjectId);
  return {
    ...exam,
    subject: { ...exam.subject, teacherId: THANAKORN_TEACHER_ID, teacherName: THANAKORN_TEACHER_NAME },
  };
}

async function teacherExamIsOpen(exam: NonNullable<Awaited<ReturnType<typeof resolveExam>>>) {
  await ensureThanakornTeacher();
  const teacher = await getTeacher(exam.subject.teacherId);
  return Boolean(teacher?.status === "approved" && teacher.examEnabled);
}

export async function GET(request: Request) {
  if (!(await getExamEnabled())) return Response.json({ error: "ระบบสอบยังไม่เปิด" }, { status: 423 });

  const subjectId = getSubjectId(new URL(request.url).searchParams.get("subject"));
  const exam = await resolveExam(subjectId);
  if (!exam) return Response.json({ error: "ไม่พบข้อสอบรายวิชานี้" }, { status: 404 });
  if (!(await teacherExamIsOpen(exam))) return Response.json({ error: "ครูผู้สอนปิดข้อสอบอยู่" }, { status: 423 });
  const questions = exam.questions.map(({ answer: _answer, ...question }) => question);
  return Response.json({
    subject: exam.subject,
    title: exam.title,
    questions,
  });
}

export async function POST(request: Request) {
  let body: Submission;
  try {
    body = (await request.json()) as Submission;
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const name = cleanText(body.name, 120);
  const classLevel = cleanText(body.classLevel, 80);
  const studentId = cleanText(body.studentId, 80);
  const subjectId = getSubjectId(body.subjectId);
  const exam = await resolveExam(subjectId);
  if (!exam) return Response.json({ error: "ไม่พบข้อสอบรายวิชานี้" }, { status: 404 });
  const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};

  if (!name || !classLevel || !studentId) {
    return Response.json({ error: "กรอกชื่อ ชั้น และรหัสนักศึกษาให้ครบ" }, { status: 400 });
  }

  const answered = exam.questions.filter((question) => typeof answers[String(question.id)] === "string").length;
  const score = exam.questions.reduce(
    (total, question) => total + (answers[String(question.id)] === question.answer ? 1 : 0),
    0,
  );
  const total = exam.questions.length;
  const warnings = Math.max(0, Math.min(99, Number(body.warnings) || 0));
  const elapsedSeconds = Math.max(0, Math.min(86_400, Number(body.elapsedSeconds) || 0));
  const submittedAt = cleanText(body.submittedAt, 80) || new Date().toISOString();
  const payload = {
    submittedAt,
    name,
    classLevel,
    studentId,
    subject: exam.subject.title,
    teacher: exam.subject.teacherName,
    score,
    total,
    percent: Math.round((score / total) * 100),
    answered,
    warnings,
    elapsedSeconds,
    startedAt: cleanText(body.startedAt, 80),
  };

  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) {
    return Response.json({
      ...payload,
      recorded: false,
      message: "คำนวณคะแนนแล้ว แต่ยังไม่ได้เชื่อมปลายทาง Google Sheets",
    });
  }

  after(async () => {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          // The existing Google Apps Script stores classLevel in one column.
          // Keep the selected subject visible in that sheet without requiring a script migration.
          classLevel: `${classLevel} | ${exam.subject.title}`,
        }),
      });
    } catch {
      // Scoring has already been shown to the student; a background sheet error must not delay it.
    }
  });

  return Response.json({
    ...payload,
    recorded: false,
    recording: true,
    message: "แสดงคะแนนแล้ว ระบบกำลังบันทึกผลลง Google Sheets",
  });
}
