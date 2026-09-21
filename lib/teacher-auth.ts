const SESSION_COOKIE = "exam_teacher_session";
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesFromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function cookie(request: Request) {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry ? entry.slice(SESSION_COOKIE.length + 1) : "";
}

async function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("missing session secret");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createTeacherSession(teacherId: string) {
  const payload = base64Url(encoder.encode(JSON.stringify({ role: "teacher", teacherId, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload))));
  return `${payload}.${signature}`;
}

export async function teacherSessionId(request: Request) {
  try {
    const [payload, signature] = cookie(request).split(".");
    if (!payload || !signature) return "";
    const valid = await crypto.subtle.verify("HMAC", await signingKey(), bytesFromBase64Url(signature), encoder.encode(payload));
    if (!valid) return "";
    const session = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload))) as { role?: unknown; teacherId?: unknown; exp?: unknown };
    return session.role === "teacher" && typeof session.teacherId === "string" && session.teacherId && typeof session.exp === "number" && session.exp > Math.floor(Date.now() / 1000)
      ? session.teacherId
      : "";
  } catch {
    return "";
  }
}

export function teacherSessionCookie(value: string, maxAge: number) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export const teacherSessionSeconds = SESSION_SECONDS;

export async function hashTeacherPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, key, 256);
  return { hash: base64Url(new Uint8Array(bits)), salt: base64Url(salt) };
}

export async function verifyTeacherPassword(password: string, salt: string, expectedHash: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytesFromBase64Url(salt), iterations: 100_000 }, key, 256);
  const actual = base64Url(new Uint8Array(bits));
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}
