import { examQuestions } from "@/lib/exam-data";

export const runtime = "edge";

type Submission = {
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

export async function GET() {
  const questions = examQuestions.map(({ answer: _answer, ...question }) => question);
  return Response.json({
    title: "แบบทดสอบงานอิเล็กทรอนิกส์รถยนต์เบื้องต้น",
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
  const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};

  if (!name || !classLevel || !studentId) {
    return Response.json({ error: "กรอกชื่อ ชั้น และรหัสนักศึกษาให้ครบ" }, { status: 400 });
  }

  const answered = examQuestions.filter((question) => typeof answers[String(question.id)] === "string").length;
  const score = examQuestions.reduce(
    (total, question) => total + (answers[String(question.id)] === question.answer ? 1 : 0),
    0,
  );
  const total = examQuestions.length;
  const warnings = Math.max(0, Math.min(99, Number(body.warnings) || 0));
  const elapsedSeconds = Math.max(0, Math.min(86_400, Number(body.elapsedSeconds) || 0));
  const submittedAt = cleanText(body.submittedAt, 80) || new Date().toISOString();
  const payload = {
    submittedAt,
    name,
    classLevel,
    studentId,
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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`sheet response ${response.status}`);
    return Response.json({ ...payload, recorded: true });
  } catch {
    return Response.json({
      ...payload,
      recorded: false,
      message: "คำนวณคะแนนแล้ว แต่ส่งไปยัง Google Sheets ไม่สำเร็จ",
    });
  }
}
