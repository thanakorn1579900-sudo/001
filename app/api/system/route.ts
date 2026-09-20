import { getExamEnabled } from "@/db/repository";

export const runtime = "edge";

export async function GET() {
  try {
    return Response.json({ examEnabled: await getExamEnabled() });
  } catch {
    return Response.json({ error: "ยังตรวจสอบสถานะระบบสอบไม่ได้" }, { status: 503 });
  }
}
