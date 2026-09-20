"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  Power,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { examSubjects, defaultExamSubjectId, isExamSubjectId, type ExamSubjectId } from "@/lib/exam-subjects";

type Option = { label: string; text: string };
type Question = { id: number; question: string; options: Option[] };
type ExamData = {
  subject: { id: ExamSubjectId; title: string; description: string; questionCount: number };
  title: string;
  questions: Question[];
};
type Result = {
  score: number;
  total: number;
  percent: number;
  answered: number;
  warnings: number;
  elapsedSeconds: number;
  recorded: boolean;
  subject?: string;
  message?: string;
};
type SystemStatus = { examEnabled: boolean };
type AdminStatus = { authenticated: boolean; examEnabled: boolean };

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
};

export function ExamApp() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [admin, setAdminState] = useState<AdminStatus | null>(null);
  const [portal, setPortal] = useState<"student" | "admin">("student");
  const [accountError, setAccountError] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<ExamSubjectId>(defaultExamSubjectId);
  const [screen, setScreen] = useState<"register" | "exam" | "result">("register");
  const [form, setForm] = useState({ name: "", classLevel: "", studentId: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [violation, setViolation] = useState("");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const examActive = useRef(false);
  const lastViolation = useRef(0);
  const fullScreenExpected = useRef(false);
  const startTime = useRef(0);

  const refreshSystem = async () => {
    setAccountError("");
    try {
      const response = await fetch("/api/system", { cache: "no-store" });
      const data = await response.json() as SystemStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถตรวจสอบสถานะระบบสอบได้");
      setSystem(data);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสถานะระบบสอบได้");
    }
  };

  const refreshAdmin = async () => {
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      const data = await response.json() as AdminStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถตรวจสอบสิทธิ์แอดมินได้");
      setAdminState(data);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสิทธิ์แอดมินได้");
    }
  };

  useEffect(() => { void refreshSystem(); }, []);

  useEffect(() => {
    if (!system?.examEnabled) return;
    let cancelled = false;
    setExam(null);
    setLoadError("");
    fetch(`/api/exam?subject=${encodeURIComponent(selectedSubjectId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<ExamData>;
      })
      .then((data) => !cancelled && setExam(data))
      .catch(() => !cancelled && setLoadError("ไม่สามารถโหลดข้อสอบได้ กรุณาลองใหม่"));
    return () => { cancelled = true; };
  }, [selectedSubjectId, system?.examEnabled]);

  useEffect(() => {
    if (screen !== "exam") return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    const addViolation = (reason: string) => {
      if (!examActive.current || submitting) return;
      const now = Date.now();
      if (now - lastViolation.current < 850) return;
      lastViolation.current = now;
      setWarnings((count) => count + 1);
      setViolation(reason);
    };
    const onVisibility = () => {
      if (document.hidden) addViolation("ตรวจพบการสลับแท็บหรือย่อหน้าต่างระหว่างทำข้อสอบ");
    };
    const onFullscreen = () => {
      if (fullScreenExpected.current && !document.fullscreenElement) {
        addViolation("ตรวจพบการออกจากโหมดเต็มหน้าจอ");
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!examActive.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!examActive.current) return;
      const blocked = (event.ctrlKey || event.metaKey) && ["c", "v", "x", "p", "s", "u"].includes(event.key.toLowerCase());
      if (blocked || event.key === "F12") {
        event.preventDefault();
        addViolation("การคัดลอก วาง บันทึก หรือเปิดเครื่องมือพัฒนาไม่อนุญาตระหว่างสอบ");
      }
    };
    const onRestrictedAction = (event: Event) => {
      if (!examActive.current) return;
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onRestrictedAction);
    document.addEventListener("copy", onRestrictedAction);
    document.addEventListener("cut", onRestrictedAction);
    document.addEventListener("paste", onRestrictedAction);
    document.addEventListener("dragstart", onRestrictedAction);
    document.addEventListener("selectstart", onRestrictedAction);
    document.addEventListener("drop", onRestrictedAction);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onRestrictedAction);
      document.removeEventListener("copy", onRestrictedAction);
      document.removeEventListener("cut", onRestrictedAction);
      document.removeEventListener("paste", onRestrictedAction);
      document.removeEventListener("dragstart", onRestrictedAction);
      document.removeEventListener("selectstart", onRestrictedAction);
      document.removeEventListener("drop", onRestrictedAction);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [submitting]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const selectedSubject = examSubjects.find((subject) => subject.id === selectedSubjectId) ?? examSubjects[0];
  const isExamLoading = !exam || exam.subject.id !== selectedSubjectId;
  const currentQuestion = exam?.questions[currentIndex];
  const progress = exam ? (answeredCount / exam.questions.length) * 100 : 0;

  const setAdmin = async (action: "login" | "logout" | "setExamEnabled", enabled?: boolean) => {
    setAdminBusy(true);
    setAccountError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "login" ? { action, password: adminPassword } : action === "setExamEnabled" ? { action, enabled } : { action }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ดำเนินการไม่สำเร็จ");
      setAdminPassword("");
      await Promise.all([refreshAdmin(), refreshSystem()]);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setAdminBusy(false);
    }
  };

  const beginExam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!exam || exam.subject.id !== selectedSubjectId) return;
    const name = form.name.trim();
    const classLevel = form.classLevel.trim();
    const studentId = form.studentId.trim();
    if (!name || !classLevel || !studentId) return;
    const now = new Date();
    examActive.current = true;
    startTime.current = Date.now();
    setStartedAt(now.toISOString());
    setElapsedSeconds(0);
    setScreen("exam");
    try {
      await document.documentElement.requestFullscreen();
      fullScreenExpected.current = true;
    } catch {
      fullScreenExpected.current = false;
      setViolation("เบราว์เซอร์ไม่อนุญาตโหมดเต็มหน้าจอ โปรดทำข้อสอบในหน้าต่างนี้ตลอดเวลา");
    }
  };

  const resumeFullScreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      fullScreenExpected.current = true;
    } catch {
      fullScreenExpected.current = false;
    }
    setViolation("");
  };

  const submitExam = async () => {
    if (!exam || submitting) return;
    setSubmitting(true);
    setSubmitDialogOpen(false);
    const stoppedAt = new Date().toISOString();
    const finalElapsed = Math.max(0, Math.floor((Date.now() - startTime.current) / 1000));
    try {
      const response = await fetch("/api/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, subjectId: selectedSubjectId, answers, warnings, elapsedSeconds: finalElapsed, startedAt, submittedAt: stoppedAt }),
      });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "ส่งคำตอบไม่สำเร็จ");
      examActive.current = false;
      fullScreenExpected.current = false;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setElapsedSeconds(finalElapsed);
      setResult(data);
      setScreen("result");
    } catch (error) {
      setViolation(error instanceof Error ? error.message : "ส่งคำตอบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (!system) {
    return <Notice icon={<LoaderCircle className="animate-spin" />} title="กำลังตรวจสอบสถานะระบบสอบ" message={accountError || "โปรดรอสักครู่"} action={accountError ? "ลองใหม่" : undefined} onAction={accountError ? () => void refreshSystem() : undefined} />;
  }

  if (portal === "admin") {
    return <AdminPortal admin={admin} password={adminPassword} setPassword={setAdminPassword} busy={adminBusy} error={accountError} onBack={() => { setPortal("student"); setAccountError(""); }} onLogin={() => void setAdmin("login")} onLogout={() => void setAdmin("logout")} onSetEnabled={(enabled) => void setAdmin("setExamEnabled", enabled)} />;
  }

  if (!system.examEnabled) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-lg rounded-3xl border border-[#c7dada] bg-white p-8 text-center shadow-[0_20px_60px_rgb(18_60_69/12%)]">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#fff1d6] text-[#9a5b14]"><Power className="size-6" /></div>
          <h1 className="mt-5 text-2xl font-bold text-[#163c45]">ระบบสอบยังไม่เปิด</h1>
          <p className="mt-3 text-base leading-7 text-[#5d7479]">ผู้ดูแลระบบยังไม่อนุญาตให้เข้าสู่ข้อสอบ ข้อสอบจะไม่ถูกแสดงจนกว่าจะเปิดระบบ</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button type="button" onClick={() => void refreshSystem()}><RefreshCw /> ตรวจสอบอีกครั้ง</Button><Button type="button" variant="outline" onClick={() => { setPortal("admin"); void refreshAdmin(); }}><Settings2 /> ผู้ดูแลระบบ</Button></div>
        </section>
      </main>
    );
  }

  if (loadError) {
    return <Notice icon={<CircleAlert />} title="ยังเปิดข้อสอบไม่ได้" message={loadError} action="ลองโหลดใหม่" onAction={() => window.location.reload()} />;
  }
  if (screen === "exam" && !exam) {
    return <Notice icon={<LoaderCircle className="animate-spin" />} title="กำลังเตรียมข้อสอบ" message="โปรดรอสักครู่" />;
  }

  if (screen === "result" && result) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
        <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[#c5dcda] bg-white shadow-[0_24px_70px_rgb(18_60_69/12%)]">
          <div className="bg-[#0e5965] px-6 py-8 text-white sm:px-10">
            <div className="flex items-center gap-3 text-sm font-semibold text-[#dff0ec]"><ClipboardCheck className="size-5" /> ส่งคำตอบแล้ว</div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">สรุปผลการสอบ</h1>
            <p className="mt-2 text-base text-[#dff0ec]">{result.subject ?? selectedSubject.title}</p>
            <p className="mt-1 text-base text-[#dff0ec]">{form.name} · {form.classLevel} · {form.studentId}</p>
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-[1fr_1.3fr] sm:p-10">
            <div className="rounded-2xl bg-[#e6f2ef] p-6 text-center">
              <p className="text-sm font-semibold text-[#315962]">คะแนน</p>
              <p className="mt-2 text-5xl font-bold text-[#0e5965]">{result.score}<span className="text-2xl text-[#53727a]">/{result.total}</span></p>
              <p className="mt-2 text-lg font-semibold text-[#315962]">{result.percent}%</p>
            </div>
            <div className="space-y-4 py-1 text-base text-[#365860]">
              <p className="flex gap-3"><Clock3 className="mt-0.5 size-5 shrink-0 text-[#0e5965]" /> ใช้เวลา {formatDuration(result.elapsedSeconds)} น.</p>
              <p className="flex gap-3"><Gauge className="mt-0.5 size-5 shrink-0 text-[#0e5965]" /> ตอบแล้ว {result.answered} จาก {result.total} ข้อ</p>
              <p className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#b45b24]" /> การเตือนระหว่างสอบ {result.warnings} ครั้ง</p>
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${result.recorded ? "border-[#9acfc3] bg-[#e9f6f1] text-[#17604f]" : "border-[#e9c48e] bg-[#fff6e5] text-[#8b511b]"}`}>
                {result.recorded ? "บันทึกคะแนนลงตารางผลสอบแล้ว" : result.message}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "register") {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-12">
        <section className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-[#c5dcda] bg-white shadow-[0_24px_70px_rgb(18_60_69/12%)] lg:grid-cols-[1.02fr_0.98fr]">
          <div className="bg-[#0e5965] px-6 py-10 text-white sm:px-10 sm:py-14">
            <Badge className="border-[#75cbb8] bg-[#135f6b] px-3 py-1 text-sm text-[#e4faf4]" variant="outline"><ShieldCheck className="size-4" /> โหมดสอบ</Badge>
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">ข้อสอบแผนกช่างยนต์<br />โดย ครูธนากร สมปาน</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-[#dff0ec]">เลือกวิชาสอบและลงชื่อเข้าสอบ ระบบตรวจคะแนนหลังส่งคำตอบและบันทึกเหตุการณ์ระหว่างทำข้อสอบ</p>
            <div className="mt-10 border-t border-[#45909a] pt-7">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9cd8cb]">กติกาการสอบ</p>
              <ul className="mt-4 space-y-4 text-base text-[#edfafa]">
                <li className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-[#f2b84b]" /> เริ่มสอบในโหมดเต็มหน้าจอ</li>
                <li className="flex gap-3"><DoorOpen className="mt-0.5 size-5 shrink-0 text-[#f2b84b]" /> การสลับแท็บหรือออกจากเต็มหน้าจอจะถูกบันทึก</li>
                <li className="flex gap-3"><Clock3 className="mt-0.5 size-5 shrink-0 text-[#f2b84b]" /> ระบบบันทึกเวลาที่ใช้ทำข้อสอบ</li>
              </ul>
            </div>
          </div>
          <div className="p-6 sm:p-10">
            <div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#0e5965]">ลงชื่อเข้าสอบ</p><p className="mt-1 text-base text-[#526b73]">กรอกข้อมูลให้ครบก่อนเริ่มทำข้อสอบ</p></div><button type="button" onClick={() => { setPortal("admin"); void refreshAdmin(); }} className="shrink-0 text-sm font-semibold text-[#0e5965] hover:underline">ผู้ดูแลระบบ</button></div>
            <form className="space-y-5" onSubmit={beginExam}>
              <div className="space-y-3">
                <Label>เลือกวิชาสอบ</Label>
                <RadioGroup value={selectedSubjectId} onValueChange={(value) => {
                  if (isExamSubjectId(value)) setSelectedSubjectId(value);
                }} className="grid gap-3">
                  {examSubjects.map((subject) => {
                    const id = `subject-${subject.id}`;
                    const isSelected = subject.id === selectedSubjectId;
                    return <label key={subject.id} htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${isSelected ? "border-[#0e5965] bg-[#e7f4f1]" : "border-[#cfdddd] bg-white hover:border-[#95c9bf]"}`}>
                      <RadioGroupItem value={subject.id} id={id} className="mt-0.5 border-[#6d9699] text-[#0e5965]" />
                      <span><span className="block font-semibold text-[#173f47]">{subject.title}</span><span className="mt-1 block text-sm leading-5 text-[#526b73]">{subject.description} · {subject.questionCount} ข้อ</span></span>
                    </label>;
                  })}
                </RadioGroup>
              </div>
              <div className="space-y-2"><Label htmlFor="name">ชื่อ - นามสกุล</Label><Input id="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="เช่น สมชาย ใจดี" className="h-11 bg-white text-base" /></div>
              <div className="space-y-2"><Label htmlFor="classLevel">ชั้น / ห้อง</Label><Input id="classLevel" required value={form.classLevel} onChange={(event) => setForm({ ...form, classLevel: event.target.value })} placeholder="เช่น ปวช. 2/1" className="h-11 bg-white text-base" /></div>
              <div className="space-y-2"><Label htmlFor="studentId">รหัสนักศึกษา</Label><Input id="studentId" required value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} placeholder="กรอกรหัสนักศึกษา" className="h-11 bg-white text-base" /></div>
              <div className="rounded-xl bg-[#edf5f4] px-4 py-3 text-sm leading-6 text-[#365860]">เมื่อกดเริ่มทำข้อสอบ ระบบจะขอเปิดเต็มหน้าจอ และตรวจจับการออกจากหน้าสอบ</div>
              <Button type="submit" size="lg" disabled={isExamLoading} className="h-12 w-full bg-[#0e5965] text-base hover:bg-[#094852] disabled:bg-[#5f7c82]">{isExamLoading ? <LoaderCircle className="size-5 animate-spin" /> : <UserRoundCheck className="size-5" />}{isExamLoading ? "กำลังเตรียมข้อสอบ" : "เริ่มทำข้อสอบ"}</Button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  if (!currentQuestion) return null;
  const selected = answers[String(currentQuestion.id)];
  return (
    <main className="exam-protected min-h-screen bg-[#f1f6f6]" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
      <header className="sticky top-0 z-20 border-b border-[#bed4d4] bg-[#0e5965] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#ccece4]">{exam.title}</p><p className="text-xs text-[#95d5c8]">ข้อ {currentIndex + 1} จาก {exam.questions.length}</p></div>
          <div className="flex items-center gap-3"><Badge className="hidden border-[#5bab9e] bg-[#135f6b] text-[#e7faf5] sm:inline-flex" variant="outline"><AlertTriangle className="size-3.5" /> เตือน {warnings}</Badge><div className="flex items-center gap-2 rounded-lg bg-[#073f49] px-3 py-2 font-mono text-sm font-bold"><Clock3 className="size-4 text-[#f2b84b]" />{formatDuration(elapsedSeconds)}</div></div>
        </div>
        <Progress value={progress} className="h-1 rounded-none bg-[#084954] [&_[data-slot=progress-indicator]]:bg-[#f2b84b]" />
      </header>
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6">
        <aside className="order-2 rounded-2xl border border-[#c7dada] bg-white p-4 lg:order-1 lg:h-fit">
          <div className="flex items-center justify-between"><p className="text-sm font-bold text-[#173f47]">รายการข้อสอบ</p><span className="text-xs text-[#567279]">ตอบ {answeredCount}/{exam.questions.length}</span></div>
          <div className="mt-4 grid grid-cols-8 gap-2 lg:grid-cols-5">
            {exam.questions.map((question, index) => <button key={question.id} type="button" onClick={() => setCurrentIndex(index)} aria-label={`ไปข้อ ${question.id}`} className={`aspect-square rounded-lg text-sm font-bold transition ${index === currentIndex ? "bg-[#0e5965] text-white ring-2 ring-[#a6dacf] ring-offset-2" : answers[String(question.id)] ? "bg-[#dff0ec] text-[#0e5965] hover:bg-[#c8e6df]" : "bg-[#edf2f3] text-[#5d7479] hover:bg-[#dfe9ea]"}`}>{question.id}</button>)}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#5d7479]"><span className="size-2 rounded-full bg-[#0e5965]" />กำลังทำ <span className="ml-2 size-2 rounded-full bg-[#dff0ec] ring-1 ring-[#81b9ad]" />ตอบแล้ว</div>
        </aside>
        <article className="order-1 rounded-3xl border border-[#c7dada] bg-white shadow-[0_14px_36px_rgb(18_60_69/7%)] lg:order-2">
          <div className="border-b border-[#dbe7e7] px-6 py-5 sm:px-9"><p className="text-sm font-semibold text-[#0e5965]">คำถามข้อที่ {currentQuestion.id}</p><h1 className="mt-3 text-xl font-bold leading-8 text-[#143a43] sm:text-2xl">{currentQuestion.question}</h1></div>
          <div className="px-6 py-7 sm:px-9 sm:py-9">
            <RadioGroup value={selected ?? ""} onValueChange={(value) => setAnswers((existing) => ({ ...existing, [String(currentQuestion.id)]: value }))} className="gap-3">
              {currentQuestion.options.map((option) => {
                const id = `question-${currentQuestion.id}-${option.label}`;
                const isSelected = selected === option.label;
                return <label key={option.label} htmlFor={id} className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 text-base leading-7 transition sm:p-5 ${isSelected ? "border-[#0e5965] bg-[#e7f4f1] shadow-sm" : "border-[#d4e1e2] bg-white hover:border-[#95c9bf] hover:bg-[#f6fbfa]"}`}><RadioGroupItem value={option.label} id={id} className="mt-1 size-5 border-[#6d9699] text-[#0e5965]" /><span><span className="mr-2 font-bold text-[#0e5965]">{option.label}.</span>{option.text}</span></label>;
              })}
            </RadioGroup>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-[#dbe7e7] bg-[#f8fbfb] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <Button type="button" variant="outline" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} className="h-11"><ArrowLeft /> ข้อก่อนหน้า</Button>
            {currentIndex === exam.questions.length - 1 ? <Button type="button" onClick={() => setSubmitDialogOpen(true)} className="h-11 bg-[#0e5965] text-base hover:bg-[#094852]">ส่งคำตอบ <CheckCircle2 /></Button> : <Button type="button" onClick={() => setCurrentIndex((index) => Math.min(exam.questions.length - 1, index + 1))} className="h-11">ข้อถัดไป <ArrowRight /></Button>}
          </div>
        </article>
      </section>
      <Dialog open={Boolean(violation)} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false} className="border-[#e5bb7c] bg-[#fffaf0] sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#8b511b]"><AlertTriangle className="size-5" /> แจ้งเตือนระหว่างสอบ</DialogTitle><DialogDescription className="leading-6 text-[#6b5636]">{violation} ระบบบันทึกเหตุการณ์นี้ไว้แล้ว</DialogDescription></DialogHeader><DialogFooter><Button type="button" onClick={resumeFullScreen} className="bg-[#0e5965]">กลับเข้าสู่โหมดสอบ</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>ส่งคำตอบและจบการสอบ?</DialogTitle><DialogDescription className="leading-6">คุณตอบแล้ว {answeredCount} จาก {exam.questions.length} ข้อ เมื่อส่งคำตอบแล้วจะไม่สามารถแก้ไขได้</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setSubmitDialogOpen(false)}>กลับไปตรวจคำตอบ</Button><Button type="button" onClick={submitExam} className="bg-[#0e5965]">ยืนยันส่งคำตอบ</Button></DialogFooter></DialogContent>
      </Dialog>
    </main>
  );
}

function AdminPortal({ admin, password, setPassword, busy, error, onBack, onLogin, onLogout, onSetEnabled }: {
  admin: AdminStatus | null;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string;
  onBack: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onSetEnabled: (enabled: boolean) => void;
}) {
  if (!admin?.authenticated) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-lg rounded-3xl border border-[#c7dada] bg-white p-8 shadow-[0_20px_60px_rgb(18_60_69/12%)]">
          <div><div className="grid size-12 place-items-center rounded-2xl bg-[#e6f2ef] text-[#0e5965]"><Settings2 className="size-6" /></div><h1 className="mt-5 text-2xl font-bold text-[#163c45]">เข้าสู่ระบบแอดมิน</h1></div>
          <p className="mt-3 leading-7 text-[#5d7479]">กรอกรหัสผ่านแอดมินเพื่อเปิดหรือปิดระบบสอบ รหัสผ่านจะไม่แสดงให้ผู้เรียนเห็น</p>
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); onLogin(); }}><div className="space-y-2"><Label htmlFor="admin-password">รหัสผ่านแอดมิน</Label><Input id="admin-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="กรอกรหัสผ่าน" /></div>{error ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{error}</p> : null}<Button type="submit" disabled={busy} className="w-full bg-[#0e5965]">{busy ? <LoaderCircle className="animate-spin" /> : <Settings2 />} เข้าสู่ระบบแอดมิน</Button></form>
          <button type="button" onClick={onBack} className="mt-5 text-sm font-semibold text-[#567279] hover:text-[#0e5965] hover:underline">กลับไปหน้าข้อสอบ</button>
        </section>
      </main>
    );
  }

  const status = admin.examEnabled;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#c5dcda] bg-white shadow-[0_24px_70px_rgb(18_60_69/12%)]">
        <div className="bg-[#0e5965] px-7 py-8 text-white sm:px-10"><div className="flex items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#dff0ec]"><Settings2 className="size-4" /> แผงควบคุมผู้ดูแล</p><h1 className="mt-3 text-3xl font-bold">ระบบสอบแผนกช่างยนต์</h1></div><Button type="button" variant="secondary" onClick={onLogout}>ออกจากระบบ</Button></div></div>
        <div className="p-7 sm:p-10"><div className={`rounded-2xl border p-6 ${status ? "border-[#9acfc3] bg-[#e9f6f1]" : "border-[#e9c48e] bg-[#fff6e5]"}`}><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#526b73]">สถานะระบบสอบ</p><p className={`mt-1 text-2xl font-bold ${status ? "text-[#17604f]" : "text-[#8b511b]"}`}>{status ? "เปิดรับนักเรียนเข้าสอบ" : "ปิดระบบสอบ"}</p><p className="mt-2 max-w-md text-sm leading-6 text-[#526b73]">{status ? "นักเรียนจึงจะโหลดข้อสอบได้" : "นักเรียนจะไม่สามารถเปิดดูข้อสอบหรือเริ่มสอบได้"}</p></div><Button type="button" disabled={busy} onClick={() => onSetEnabled(!status)} className={status ? "bg-[#9b3d32] hover:bg-[#7f3027]" : "bg-[#0e5965] hover:bg-[#094852]"}>{busy ? <LoaderCircle className="animate-spin" /> : <Power />}{status ? "ปิดระบบสอบ" : "เปิดระบบสอบ"}</Button></div></div>{error ? <p className="mt-5 rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{error}</p> : null}<div className="mt-7 rounded-xl bg-[#edf5f4] p-4 text-sm leading-6 text-[#365860]">การปิดระบบจะหยุดการเข้าถึงข้อสอบสำหรับผู้เรียนรายใหม่ทันที แต่ผู้ที่กำลังทำข้อสอบอยู่ยังส่งคำตอบได้ตามปกติ</div></div>
      </section>
    </main>
  );
}

function Notice({ icon, title, message, action, onAction }: { icon: ReactNode; title: string; message: string; action?: string; onAction?: () => void }) {
  return <main className="grid min-h-screen place-items-center px-4"><section className="w-full max-w-md rounded-3xl border border-[#c7dada] bg-white p-8 text-center shadow-[0_20px_60px_rgb(18_60_69/12%)]"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#dff0ec] text-[#0e5965]">{icon}</div><h1 className="mt-5 text-xl font-bold text-[#163c45]">{title}</h1><p className="mt-2 text-base text-[#5d7479]">{message}</p>{action && onAction ? <Button className="mt-6" onClick={onAction}>{action}</Button> : null}</section></main>;
}
