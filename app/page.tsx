import { ExamApp } from "@/components/exam-app";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-lg rounded-3xl border border-[#c5dcda] bg-white p-8 text-center shadow-[0_24px_70px_rgb(18_60_69/12%)] sm:p-10">
          <p className="text-sm font-semibold text-[#0e5965]">ข้อสอบแผนกช่างยนต์</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#143a43]">ลงชื่อเข้าใช้ก่อนเข้าสู่ระบบสอบ</h1>
          <p className="mt-4 text-base leading-7 text-[#526b73]">ใช้บัญชี ChatGPT เพื่อยืนยันตัวตน จากนั้นลงทะเบียนชื่อ ชั้น และรหัสนักศึกษาสำหรับใช้บันทึกผลสอบ</p>
          <a href={chatGPTSignInPath("/")} target="_top" className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-[#0e5965] px-6 text-base font-semibold text-white transition hover:bg-[#094852]">ลงชื่อเข้าใช้ด้วย ChatGPT</a>
        </section>
      </main>
    );
  }

  return <ExamApp viewerName={user.fullName ?? user.displayName} signOutUrl={chatGPTSignOutPath("/")} />;
}
