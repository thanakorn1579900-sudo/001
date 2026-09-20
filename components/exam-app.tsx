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
  Eye,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Power,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { examSubjects, defaultExamSubjectId } from "@/lib/exam-subjects";

type Option = { label: string; text: string };
type Question = { id: number; question: string; options: Option[] };
type Subject = { id: string; title: string; description: string; questionCount: number };
type ExamData = {
  subject: Subject;
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
  recording?: boolean;
  subject?: string;
  message?: string;
};
type SystemStatus = { examEnabled: boolean };
type AdminStatus = { authenticated: boolean; examEnabled: boolean };
type UploadedExam = Subject & { sourceFileName: string; createdAt: string };
type EditableQuestion = Question & { answer: string };
type EditableExam = UploadedExam & { questions: EditableQuestion[] };

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
  const [uploadedExams, setUploadedExams] = useState<UploadedExam[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([...examSubjects]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(defaultExamSubjectId);
  const [screen, setScreen] = useState<"register" | "exam" | "result">("register");
  const [form, setForm] = useState({ name: "", classLevel: "", studentId: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [violation, setViolation] = useState("");
  const [unansweredTarget, setUnansweredTarget] = useState<number | null>(null);
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

  const refreshSubjects = async () => {
    try {
      const response = await fetch("/api/subjects", { cache: "no-store" });
      const data = await response.json() as { subjects?: Subject[]; error?: string };
      if (!response.ok || !Array.isArray(data.subjects)) throw new Error(data.error || "ไม่สามารถโหลดรายวิชาได้");
      setSubjects(data.subjects);
      setSelectedSubjectId((current) => data.subjects?.some((subject) => subject.id === current) ? current : data.subjects?.[0]?.id || defaultExamSubjectId);
    } catch {
      // The built-in subjects remain available if the optional uploaded list cannot load.
    }
  };

  const refreshUploadedExams = async () => {
    try {
      const response = await fetch("/api/admin/exams", { cache: "no-store" });
      const data = await response.json() as { exams?: UploadedExam[]; error?: string };
      if (!response.ok || !Array.isArray(data.exams)) throw new Error(data.error || "ไม่สามารถโหลดรายการข้อสอบได้");
      setUploadedExams(data.exams);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "ไม่สามารถโหลดรายการข้อสอบได้");
    }
  };

  const refreshAdmin = async () => {
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      const data = await response.json() as AdminStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถตรวจสอบสิทธิ์แอดมินได้");
      setAdminState(data);
      if (data.authenticated) void refreshUploadedExams();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "ไม่สามารถตรวจสอบสิทธิ์แอดมินได้");
    }
  };

  useEffect(() => { void refreshSystem(); }, []);

  useEffect(() => {
    if (system?.examEnabled) void refreshSubjects();
  }, [system?.examEnabled]);

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
  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0] ?? examSubjects[0];
  const isExamLoading = !exam || exam.subject.id !== selectedSubjectId;
  const currentQuestion = exam?.questions[currentIndex];
  const progress = exam ? (answeredCount / exam.questions.length) * 100 : 0;
  const unansweredCount = exam ? exam.questions.length - answeredCount : 0;

  const moveToQuestion = (targetIndex: number) => {
    if (!currentQuestion || targetIndex === currentIndex) return;
    if (!answers[String(currentQuestion.id)]) {
      setUnansweredTarget(targetIndex);
      return;
    }
    setCurrentIndex(targetIndex);
  };

  const skipCurrentQuestion = () => {
    if (unansweredTarget === null) return;
    setCurrentIndex(unansweredTarget);
    setUnansweredTarget(null);
  };

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

  const uploadExam = async ({ file, title, description }: { file: File; title: string; description: string }) => {
    setUploadBusy(true);
    setUploadError("");
    setUploadNotice("");
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("title", title);
      data.set("description", description);
      const response = await fetch("/api/admin/exams", { method: "POST", body: data });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "ไม่สามารถอัปโหลดข้อสอบได้");
      setUploadNotice(result.message || "เพิ่มข้อสอบแล้ว");
      await Promise.all([refreshUploadedExams(), refreshSubjects()]);
      return true;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "ไม่สามารถอัปโหลดข้อสอบได้");
      return false;
    } finally {
      setUploadBusy(false);
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
    return <AdminPortal admin={admin} password={adminPassword} setPassword={setAdminPassword} busy={adminBusy} error={accountError} uploadedExams={uploadedExams} uploadBusy={uploadBusy} uploadError={uploadError} uploadNotice={uploadNotice} onBack={() => { setPortal("student"); setAccountError(""); }} onLogin={() => void setAdmin("login")} onLogout={() => void setAdmin("logout")} onSetEnabled={(enabled) => void setAdmin("setExamEnabled", enabled)} onUpload={uploadExam} onDataChanged={() => { void Promise.all([refreshUploadedExams(), refreshSubjects()]); }} />;
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
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${result.recorded ? "border-[#9acfc3] bg-[#e9f6f1] text-[#17604f]" : result.recording ? "border-[#9dbdce] bg-[#edf6fa] text-[#1e5b78]" : "border-[#e9c48e] bg-[#fff6e5] text-[#8b511b]"}`}>
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
                <RadioGroup value={selectedSubjectId} onValueChange={setSelectedSubjectId} className="grid gap-3">
                  {subjects.map((subject) => {
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
            {exam.questions.map((question, index) => <button key={question.id} type="button" onClick={() => moveToQuestion(index)} aria-label={`ไปข้อ ${question.id}`} className={`aspect-square rounded-lg text-sm font-bold transition ${index === currentIndex ? "bg-[#0e5965] text-white ring-2 ring-[#a6dacf] ring-offset-2" : answers[String(question.id)] ? "bg-[#dff0ec] text-[#0e5965] hover:bg-[#c8e6df]" : "bg-[#edf2f3] text-[#5d7479] hover:bg-[#dfe9ea]"}`}>{question.id}</button>)}
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
            <Button type="button" variant="outline" onClick={() => moveToQuestion(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} className="h-11"><ArrowLeft /> ข้อก่อนหน้า</Button>
            {currentIndex === exam.questions.length - 1 ? <Button type="button" onClick={() => setSubmitDialogOpen(true)} className="h-11 bg-[#0e5965] text-base hover:bg-[#094852]">ส่งคำตอบ <CheckCircle2 /></Button> : <Button type="button" onClick={() => moveToQuestion(Math.min(exam.questions.length - 1, currentIndex + 1))} className="h-11">ข้อถัดไป <ArrowRight /></Button>}
          </div>
        </article>
      </section>
      <Dialog open={unansweredTarget !== null} onOpenChange={(open) => { if (!open) setUnansweredTarget(null); }}>
        <DialogContent className="border-[#e5bb7c] bg-[#fffaf0] sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#8b511b]"><AlertTriangle className="size-5" /> ยังไม่ได้ตอบข้อ {currentQuestion.id}</DialogTitle><DialogDescription className="leading-6 text-[#6b5636]">ต้องการกลับไปตอบข้อนี้ หรือข้ามไปก่อน?</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setUnansweredTarget(null)}>กลับไปตอบข้อนี้</Button><Button type="button" onClick={skipCurrentQuestion} className="bg-[#9b5a17] hover:bg-[#7f4912]">ข้ามไปก่อน</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={Boolean(violation)} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false} className="border-[#e5bb7c] bg-[#fffaf0] sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#8b511b]"><AlertTriangle className="size-5" /> แจ้งเตือนระหว่างสอบ</DialogTitle><DialogDescription className="leading-6 text-[#6b5636]">{violation} ระบบบันทึกเหตุการณ์นี้ไว้แล้ว</DialogDescription></DialogHeader><DialogFooter><Button type="button" onClick={resumeFullScreen} className="bg-[#0e5965]">กลับเข้าสู่โหมดสอบ</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>ส่งคำตอบและจบการสอบ?</DialogTitle><DialogDescription className="leading-6">คุณตอบแล้ว {answeredCount} จาก {exam.questions.length} ข้อ เมื่อส่งคำตอบแล้วจะไม่สามารถแก้ไขได้</DialogDescription></DialogHeader>{unansweredCount > 0 ? <div className="rounded-xl border border-[#e5bb7c] bg-[#fff6e5] px-4 py-3 text-sm font-medium leading-6 text-[#8b511b]"><AlertTriangle className="mr-2 inline size-4" />ยังไม่ได้ตอบ {unansweredCount} ข้อ กรุณาตรวจสอบก่อนส่ง</div> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setSubmitDialogOpen(false)}>กลับไปตรวจคำตอบ</Button><Button type="button" onClick={submitExam} className="bg-[#0e5965]">ยืนยันส่งคำตอบ</Button></DialogFooter></DialogContent>
      </Dialog>
    </main>
  );
}

function AdminPortal({ admin, password, setPassword, busy, error, uploadedExams, uploadBusy, uploadError, uploadNotice, onBack, onLogin, onLogout, onSetEnabled, onUpload, onDataChanged }: {
  admin: AdminStatus | null;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string;
  uploadedExams: UploadedExam[];
  uploadBusy: boolean;
  uploadError: string;
  uploadNotice: string;
  onBack: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onUpload: (input: { file: File; title: string; description: string }) => Promise<boolean>;
  onDataChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<EditableExam | null>(null);
  const [viewing, setViewing] = useState<EditableExam | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UploadedExam | null>(null);

  const loadExam = async (id: string, mode: "view" | "edit") => {
    setEditorBusy(true);
    setEditorError("");
    try {
      const response = await fetch(`/api/admin/exams/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { exam?: EditableExam; error?: string };
      if (!response.ok || !data.exam) throw new Error(data.error || "ไม่สามารถเปิดข้อสอบได้");
      if (mode === "view") setViewing(data.exam); else setEditing(data.exam);
    } catch (loadError) {
      setEditorError(loadError instanceof Error ? loadError.message : "ไม่สามารถเปิดข้อสอบได้");
    } finally {
      setEditorBusy(false);
    }
  };

  const saveEditor = async () => {
    if (!editing) return;
    setEditorBusy(true);
    setEditorError("");
    try {
      const response = await fetch(`/api/admin/exams/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editing.title, description: editing.description, questions: editing.questions }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถบันทึกการแก้ไขข้อสอบได้");
      setEditing(null);
      onDataChanged();
    } catch (saveError) {
      setEditorError(saveError instanceof Error ? saveError.message : "ไม่สามารถบันทึกการแก้ไขข้อสอบได้");
    } finally {
      setEditorBusy(false);
    }
  };

  const deleteExam = async () => {
    if (!deleteTarget) return;
    setEditorBusy(true);
    setEditorError("");
    try {
      const response = await fetch(`/api/admin/exams/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถลบชุดข้อสอบได้");
      setDeleteTarget(null);
      onDataChanged();
    } catch (deleteError) {
      setEditorError(deleteError instanceof Error ? deleteError.message : "ไม่สามารถลบชุดข้อสอบได้");
    } finally {
      setEditorBusy(false);
    }
  };

  const updateQuestion = (index: number, change: Partial<EditableQuestion>) => {
    setEditing((current) => current ? { ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...change } : question) } : current);
  };

  const updateOption = (questionIndex: number, optionIndex: number, optionText: string) => {
    setEditing((current) => current ? {
      ...current,
      questions: current.questions.map((question, index) => index === questionIndex ? { ...question, options: question.options.map((option, index) => index === optionIndex ? { ...option, text: optionText } : option) } : question),
    } : current);
  };

  const removeQuestion = (index: number) => {
    setEditing((current) => current && current.questions.length > 1 ? { ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index).map((question, questionIndex) => ({ ...question, id: questionIndex + 1 })) } : current);
  };

  const addQuestion = () => {
    setEditing((current) => current ? {
      ...current,
      questions: [...current.questions, { id: current.questions.length + 1, question: "", options: ["ก", "ข", "ค", "ง"].map((label) => ({ label, text: "" })), answer: "ก" }],
    } : current);
  };

  const addOption = (questionIndex: number) => {
    setEditing((current) => current ? {
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length >= 6) return question;
        const labels = question.options.map((option) => option.label);
        const next = labels.every((label) => /^[A-F]$/.test(label)) ? String.fromCharCode(65 + labels.length)
          : labels.every((label) => /^\d+$/.test(label)) ? String(labels.length + 1)
            : ["ก", "ข", "ค", "ง", "จ", "ฉ"][labels.length];
        return { ...question, options: [...question.options, { label: next, text: "" }] };
      }),
    } : current);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setEditing((current) => current ? {
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;
        const options = question.options.filter((_, index) => index !== optionIndex);
        return { ...question, options, answer: options.some((option) => option.label === question.answer) ? question.answer : options[0].label };
      }),
    } : current);
  };
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
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-[#c5dcda] bg-white shadow-[0_24px_70px_rgb(18_60_69/12%)]">
        <div className="bg-[#0e5965] px-7 py-8 text-white sm:px-10"><div className="flex items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-[#dff0ec]"><Settings2 className="size-4" /> แผงควบคุมผู้ดูแล</p><h1 className="mt-3 text-3xl font-bold">ระบบสอบแผนกช่างยนต์</h1></div><Button type="button" variant="secondary" onClick={onLogout}>ออกจากระบบ</Button></div></div>
        <div className="space-y-7 p-7 sm:p-10"><div className={`rounded-2xl border p-6 ${status ? "border-[#9acfc3] bg-[#e9f6f1]" : "border-[#e9c48e] bg-[#fff6e5]"}`}><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#526b73]">สถานะระบบสอบ</p><p className={`mt-1 text-2xl font-bold ${status ? "text-[#17604f]" : "text-[#8b511b]"}`}>{status ? "เปิดรับนักเรียนเข้าสอบ" : "ปิดระบบสอบ"}</p><p className="mt-2 max-w-md text-sm leading-6 text-[#526b73]">{status ? "นักเรียนจึงจะโหลดข้อสอบได้" : "นักเรียนจะไม่สามารถเปิดดูข้อสอบหรือเริ่มสอบได้"}</p></div><Button type="button" disabled={busy} onClick={() => onSetEnabled(!status)} className={status ? "bg-[#9b3d32] hover:bg-[#7f3027]" : "bg-[#0e5965] hover:bg-[#094852]"}>{busy ? <LoaderCircle className="animate-spin" /> : <Power />}{status ? "ปิดระบบสอบ" : "เปิดระบบสอบ"}</Button></div></div>{error ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{error}</p> : null}

          <section className="rounded-2xl border border-[#c7dada] bg-[#fbfefe] p-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f2ef] text-[#0e5965]"><Upload className="size-5" /></div><div><h2 className="text-lg font-bold text-[#173f47]">เพิ่มข้อสอบจากไฟล์</h2><p className="mt-1 text-sm leading-6 text-[#526b73]">อัปโหลดไฟล์พร้อมโจทย์ ตัวเลือก และเฉลย ระบบจะสร้างรายวิชาใหม่และตรวจคะแนนให้อัตโนมัติ</p></div></div>
            <form className="mt-5 space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!file) return; const complete = await onUpload({ file, title, description }); if (complete) { setFile(null); setTitle(""); setDescription(""); } }}>
              <div className="space-y-2"><Label htmlFor="exam-file">ไฟล์ข้อสอบ</Label><Input id="exam-file" type="file" accept=".docx,.txt,.csv,.json" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="cursor-pointer bg-white" /><p className="text-xs leading-5 text-[#5d7479]">รองรับ DOCX, TXT, CSV และ JSON ขนาดไม่เกิน 5 MB — ไฟล์ Word .doc กรุณาบันทึกเป็น .docx ก่อน</p></div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="uploaded-title">ชื่อวิชา / ชุดข้อสอบ</Label><Input id="uploaded-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เว้นว่างเพื่อใช้ชื่อไฟล์" /></div><div className="space-y-2"><Label htmlFor="uploaded-description">คำอธิบาย</Label><Input id="uploaded-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น สอบปลายภาค" /></div></div>
              <div className="rounded-xl bg-[#edf5f4] px-4 py-3 text-sm leading-6 text-[#365860]">รองรับ <span className="font-semibold">ข้อ1. / ข้อที่ 1. / 1. / 1)</span> ตามด้วยตัวเลือก <span className="font-semibold">ก. หรือ A.</span> ใส่เฉลยท้ายไฟล์เป็น <span className="font-semibold">เฉลย 1. ก</span> ได้ หรือใน Word ทำตัวเลือกที่ถูกเป็น <span className="font-semibold">สีแดง / All caps / Small caps</span> ระบบจะตรวจจับให้อัตโนมัติ</div>
              {uploadError ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{uploadError}</p> : null}{uploadNotice ? <p className="rounded-xl border border-[#9acfc3] bg-[#e9f6f1] px-4 py-3 text-sm font-medium text-[#17604f]">{uploadNotice}</p> : null}
              <Button type="submit" disabled={!file || uploadBusy} className="bg-[#0e5965] hover:bg-[#094852]">{uploadBusy ? <LoaderCircle className="animate-spin" /> : <Upload />} ประมวลผลและเพิ่มข้อสอบ</Button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#d8e5e5] bg-white p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-[#173f47]">ข้อสอบที่อัปโหลด</h2><p className="mt-1 text-sm text-[#526b73]">ตรวจสอบข้อสอบทีละข้อ แก้ไข หรือลบก่อนเปิดให้นักเรียนสอบ</p></div><Badge variant="outline" className="border-[#9acfc3] bg-[#e9f6f1] text-[#17604f]">{uploadedExams.length} ชุด</Badge></div>{uploadedExams.length ? <div className="mt-4 divide-y divide-[#e0ecec]">{uploadedExams.map((exam) => <div key={exam.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-[#173f47]">{exam.title}</p><p className="mt-1 text-sm leading-5 text-[#526b73]">{exam.description}</p><p className="mt-1 text-xs text-[#6e8589]">ไฟล์ {exam.sourceFileName}</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="shrink-0 bg-[#e6f2ef] text-[#0e5965] hover:bg-[#e6f2ef]">{exam.questionCount} ข้อ</Badge><Button type="button" variant="outline" size="sm" disabled={editorBusy} onClick={() => void loadExam(exam.id, "view")}><Eye /> ดูข้อสอบ</Button><Button type="button" variant="outline" size="sm" disabled={editorBusy} onClick={() => void loadExam(exam.id, "edit")}><Pencil /> แก้ไข</Button><Button type="button" variant="outline" size="sm" disabled={editorBusy} onClick={() => { setEditorError(""); setDeleteTarget(exam); }} className="border-[#e2aaa3] text-[#9b3d32] hover:bg-[#fff1ef] hover:text-[#7f3027]"><Trash2 /> ลบ</Button></div></div>)}</div> : <p className="mt-4 rounded-xl bg-[#f3f7f7] px-4 py-3 text-sm text-[#5d7479]">ยังไม่มีข้อสอบที่อัปโหลด</p>}</section>

          {editorError ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{editorError}</p> : null}
          <div className="rounded-xl bg-[#edf5f4] p-4 text-sm leading-6 text-[#365860]">การปิดระบบจะหยุดการเข้าถึงข้อสอบสำหรับผู้เรียนรายใหม่ทันที แต่ผู้ที่กำลังทำข้อสอบอยู่ยังส่งคำตอบได้ตามปกติ</div>
        </div>
      </section>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !editorBusy) { setEditing(null); setEditorError(""); } }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>แก้ไขชุดข้อสอบ</DialogTitle><DialogDescription>แก้ไขชื่อ รายละเอียด คำถาม ตัวเลือก และเฉลยได้ แล้วกดบันทึกเพื่อใช้ตรวจคะแนนอัตโนมัติ</DialogDescription></DialogHeader>
          {editing ? <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="editor-title">ชื่อชุดข้อสอบ</Label><Input id="editor-title" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="editor-description">คำอธิบาย</Label><Input id="editor-description" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></div></div>
            <div className="space-y-4">{editing.questions.map((question, questionIndex) => <section key={`${question.id}-${questionIndex}`} className="rounded-2xl border border-[#d5e3e3] bg-[#fbfefe] p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-[#173f47]">ข้อ {questionIndex + 1}</p><Button type="button" variant="ghost" size="sm" disabled={editing.questions.length === 1 || editorBusy} onClick={() => removeQuestion(questionIndex)} className="text-[#9b3d32] hover:bg-[#fff1ef] hover:text-[#7f3027]"><Trash2 /> ลบข้อนี้</Button></div><div className="mt-3 space-y-2"><Label htmlFor={`editor-question-${questionIndex}`}>คำถาม</Label><Textarea id={`editor-question-${questionIndex}`} value={question.question} onChange={(event) => updateQuestion(questionIndex, { question: event.target.value })} className="min-h-20 bg-white" /></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => <div key={option.label} className="space-y-2 rounded-xl bg-white p-2"><div className="flex items-center justify-between gap-2"><Label htmlFor={`editor-option-${questionIndex}-${optionIndex}`}>ตัวเลือก {option.label}</Label><button type="button" aria-label={`ลบตัวเลือก ${option.label}`} disabled={question.options.length <= 2 || editorBusy} onClick={() => removeOption(questionIndex, optionIndex)} className="text-xs font-semibold text-[#9b3d32] disabled:opacity-40">ลบ</button></div><Input id={`editor-option-${questionIndex}-${optionIndex}`} value={option.text} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} /></div>)}</div><Button type="button" variant="outline" size="sm" disabled={question.options.length >= 6 || editorBusy} onClick={() => addOption(questionIndex)} className="mt-3"><Plus /> เพิ่มตัวเลือก</Button><div className="mt-4 flex items-center gap-3"><Label htmlFor={`editor-answer-${questionIndex}`}>เฉลย</Label><select id={`editor-answer-${questionIndex}`} value={question.answer} onChange={(event) => updateQuestion(questionIndex, { answer: event.target.value })} className="h-9 rounded-md border border-input bg-white px-3 text-sm text-[#173f47]">{question.options.map((option) => <option key={option.label} value={option.label}>{option.label}. {option.text || "ตัวเลือก"}</option>)}</select></div></section>)}</div>
            <Button type="button" variant="outline" disabled={editorBusy || editing.questions.length >= 200} onClick={addQuestion}><Plus /> เพิ่มข้อสอบ</Button>
            {editorError ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{editorError}</p> : null}
          </div> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={editorBusy} onClick={() => { setEditing(null); setEditorError(""); }}>ยกเลิก</Button><Button type="button" disabled={editorBusy} onClick={() => void saveEditor()} className="bg-[#0e5965]">{editorBusy ? <LoaderCircle className="animate-spin" /> : <Pencil />} บันทึกการแก้ไข</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>ดูข้อสอบ: {viewing?.title}</DialogTitle><DialogDescription>รายการนี้แสดงเฉพาะในแอดมิน พร้อมเฉลยสำหรับตรวจทานก่อนเปิดสอบ</DialogDescription></DialogHeader>{viewing ? <div className="space-y-4">{viewing.questions.map((question, index) => <article key={question.id} className="rounded-2xl border border-[#d5e3e3] bg-[#fbfefe] p-4"><p className="text-sm font-semibold text-[#0e5965]">ข้อ {index + 1}</p><p className="mt-2 font-bold leading-7 text-[#173f47]">{question.question}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <p key={option.label} className={`rounded-lg border px-3 py-2 text-sm leading-6 ${option.label === question.answer ? "border-[#8fcabd] bg-[#e7f4f1] font-semibold text-[#17604f]" : "border-[#dbe7e7] bg-white text-[#365860]"}`}><span className="mr-2 font-bold">{option.label}.</span>{option.text}{option.label === question.answer ? <span className="ml-2 text-xs">เฉลย</span> : null}</p>)}</div></article>)}</div> : null}<DialogFooter><Button type="button" onClick={() => setViewing(null)}>ปิด</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !editorBusy) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-[#9b3d32]"><Trash2 className="size-5" /> ลบชุดข้อสอบ?</DialogTitle><DialogDescription className="leading-6">ต้องการลบ “{deleteTarget?.title}” ใช่หรือไม่? ไฟล์ต้นฉบับและข้อสอบชุดนี้จะถูกลบออกจากระบบ</DialogDescription></DialogHeader>{editorError ? <p className="rounded-xl border border-[#e9c48e] bg-[#fff6e5] px-4 py-3 text-sm font-medium text-[#8b511b]">{editorError}</p> : null}<DialogFooter><Button type="button" variant="outline" disabled={editorBusy} onClick={() => setDeleteTarget(null)}>ยกเลิก</Button><Button type="button" disabled={editorBusy} onClick={() => void deleteExam()} className="bg-[#9b3d32] hover:bg-[#7f3027]">{editorBusy ? <LoaderCircle className="animate-spin" /> : <Trash2 />} ยืนยันลบ</Button></DialogFooter></DialogContent>
      </Dialog>
    </main>
  );
}

function Notice({ icon, title, message, action, onAction }: { icon: ReactNode; title: string; message: string; action?: string; onAction?: () => void }) {
  return <main className="grid min-h-screen place-items-center px-4"><section className="w-full max-w-md rounded-3xl border border-[#c7dada] bg-white p-8 text-center shadow-[0_20px_60px_rgb(18_60_69/12%)]"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#dff0ec] text-[#0e5965]">{icon}</div><h1 className="mt-5 text-xl font-bold text-[#163c45]">{title}</h1><p className="mt-2 text-base text-[#5d7479]">{message}</p>{action && onAction ? <Button className="mt-6" onClick={onAction}>{action}</Button> : null}</section></main>;
}
