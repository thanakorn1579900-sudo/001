import { getExamEnabled, setExamEnabled } from "@/db/repository";

export const runtime = "edge";

const SESSION_COOKIE = "exam_admin_session";
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesFromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getCookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

function sameSecret(value: string, expected: string) {
  if (value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < value.length; index += 1) difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

async function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("missing admin session secret");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function createSession() {
  const payload = base64Url(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload))));
  return `${payload}.${signature}`;
}

async function hasAdminSession(request: Request) {
  try {
    const [payload, signature] = getCookie(request, SESSION_COOKIE).split(".");
    if (!payload || !signature) return false;
    const valid = await crypto.subtle.verify("HMAC", await signingKey(), bytesFromBase64Url(signature), encoder.encode(payload));
    if (!valid) return false;
    const session = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload))) as { exp?: unknown };
    return typeof session.exp === "number" && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sessionCookie(value: string, maxAge: number) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

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
    const session = await createSession();
    return Response.json({ authenticated: true, examEnabled: await getExamEnabled() }, { headers: { "set-cookie": sessionCookie(session, SESSION_SECONDS) } });
  }

  if (body.action === "logout") {
    return Response.json({ authenticated: false }, { headers: { "set-cookie": sessionCookie("", 0) } });
  }

  if (body.action === "setExamEnabled") {
    if (!(await hasAdminSession(request))) return Response.json({ error: "กรุณาเข้าสู่ระบบแอดมิน" }, { status: 401 });
    if (typeof body.enabled !== "boolean") return Response.json({ error: "สถานะระบบไม่ถูกต้อง" }, { status: 400 });
    await setExamEnabled(body.enabled);
    return Response.json({ authenticated: true, examEnabled: body.enabled });
  }

  return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
}
