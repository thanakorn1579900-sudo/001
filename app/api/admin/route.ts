import { getChatGPTUser } from "@/app/chatgpt-auth";
import { bootstrapFirstAdmin, getExamEnabled, isAdmin, setExamEnabled } from "@/db/repository";

export const runtime = "edge";

function sameToken(value: string, expected: string) {
  if (value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < value.length; index += 1) difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "กรุณาลงชื่อเข้าใช้ก่อน" }, { status: 401 });

  let body: { action?: unknown; setupToken?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; setupToken?: unknown; enabled?: unknown };
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    if (body.action === "setup") {
      const expected = process.env.ADMIN_SETUP_TOKEN;
      const setupToken = typeof body.setupToken === "string" ? body.setupToken.trim() : "";
      if (!expected || !sameToken(setupToken, expected)) {
        return Response.json({ error: "รหัสตั้งค่าผู้ดูแลไม่ถูกต้อง" }, { status: 403 });
      }
      const created = await bootstrapFirstAdmin(user.userId, user.email);
      if (!created) return Response.json({ error: "ระบบมีผู้ดูแลแล้ว" }, { status: 409 });
      return Response.json({ isAdmin: true, examEnabled: await getExamEnabled() }, { status: 201 });
    }

    if (body.action === "setExamEnabled") {
      if (!(await isAdmin(user.userId))) return Response.json({ error: "เฉพาะผู้ดูแลระบบเท่านั้น" }, { status: 403 });
      if (typeof body.enabled !== "boolean") return Response.json({ error: "สถานะระบบไม่ถูกต้อง" }, { status: 400 });
      await setExamEnabled(body.enabled);
      return Response.json({ examEnabled: body.enabled });
    }

    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  } catch {
    return Response.json({ error: "เปลี่ยนสถานะระบบไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
}
