import { getExamEnabled, setExamEnabled } from "@/db/repository";
import { adminSessionCookie, adminSessionSeconds, createAdminSession, hasAdminSession, sameSecret } from "@/lib/admin-session";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    return Response.json({ authenticated: await hasAdminSession(request), examEnabled: await getExamEnabled() });
  } catch {
    return Response.json({ authenticated: false, examEnabled: false }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: { action?: unknown; password?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; password?: unknown; enabled?: unknown };
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (body.action === "login") {
    const password = typeof body.password === "string" ? body.password : "";
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || !sameSecret(password, expected)) return Response.json({ error: "รหัสผ่านแอดมินไม่ถูกต้อง" }, { status: 401 });
    const session = await createAdminSession();
    return Response.json({ authenticated: true, examEnabled: await getExamEnabled() }, { headers: { "set-cookie": adminSessionCookie(session, adminSessionSeconds) } });
  }

  if (body.action === "logout") {
    return Response.json({ authenticated: false }, { headers: { "set-cookie": adminSessionCookie("", 0) } });
  }

  if (body.action === "setExamEnabled") {
    if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
    if (typeof body.enabled !== "boolean") return Response.json({ error: "สถานะระบบไม่ถูกต้อง" }, { status: 400 });
    await setExamEnabled(body.enabled);
    return Response.json({ authenticated: true, examEnabled: body.enabled });
  }

  return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
}
