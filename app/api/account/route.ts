import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createStudentProfile, getExamEnabled, getStudentProfile, isAdmin } from "@/db/repository";

export const runtime = "edge";

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed: student_profiles.student_id")) {
    return "รหัสนักศึกษานี้ถูกลงทะเบียนแล้ว";
  }
  return "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่";
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ authenticated: false, examEnabled: false });

  try {
    const [profile, admin, examEnabled] = await Promise.all([
      getStudentProfile(user.userId),
      isAdmin(user.userId),
      getExamEnabled(),
    ]);
    return Response.json({ authenticated: true, profile: profile ?? null, isAdmin: admin, examEnabled });
  } catch {
    return Response.json({ error: "ระบบข้อมูลยังไม่พร้อมใช้งาน" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "กรุณาลงชื่อเข้าใช้ก่อน" }, { status: 401 });

  let body: { name?: unknown; classLevel?: unknown; studentId?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; classLevel?: unknown; studentId?: unknown };
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const name = cleanText(body.name, 120);
  const classLevel = cleanText(body.classLevel, 80);
  const studentId = cleanText(body.studentId, 80);
  if (!name || !classLevel || !studentId) {
    return Response.json({ error: "กรอกชื่อ ชั้น และรหัสนักศึกษาให้ครบ" }, { status: 400 });
  }

  try {
    const existing = await getStudentProfile(user.userId);
    if (existing) return Response.json({ error: "คุณลงทะเบียนเข้าสอบแล้ว" }, { status: 409 });
    await createStudentProfile({ userId: user.userId, email: user.email, name, classLevel, studentId });
    return Response.json({ profile: { name, classLevel, studentId } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 400 });
  }
}
