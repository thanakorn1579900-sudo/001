import { env } from "cloudflare:workers";
import { getExam } from "@/lib/exam-catalog";
import { examSubjects, isExamSubjectId, type ExamSubjectId } from "@/lib/exam-subjects";
import { normalizeUploadedQuestions, type UploadedQuestion } from "@/lib/uploaded-exams";
import { THANAKORN_TEACHER_ID } from "@/lib/teacher-accounts";

export type CatalogExam = {
  id: ExamSubjectId;
  title: string;
  description: string;
  questionCount: number;
  visible: boolean;
  questions: UploadedQuestion[];
};

type OverrideRow = {
  subjectId: string;
  title: string;
  description: string;
  questionsJson: string;
  isVisible: number;
};

function database() {
  if (!env.DB) throw new Error("ไม่พบฐานข้อมูลของระบบสอบ");
  return env.DB;
}

function baseExam(subjectId: ExamSubjectId): CatalogExam {
  const subject = examSubjects.find((item) => item.id === subjectId)!;
  const exam = getExam(subjectId);
  const questions = exam.questions.map((question, index) => ({
    id: index + 1,
    question: question.question,
    options: question.options.map((option) => ({ label: option.label, text: option.text })),
    answer: question.answer,
  }));
  return { ...subject, visible: true, questions };
}

function mergedExam(subjectId: ExamSubjectId, row?: OverrideRow): CatalogExam {
  const base = baseExam(subjectId);
  const questions = row ? normalizeUploadedQuestions(row.questionsJson) : null;
  return {
    ...base,
    title: row?.title || base.title,
    description: row?.description || base.description,
    visible: row ? Boolean(row.isVisible) : true,
    questions: questions?.length ? questions : base.questions,
    questionCount: questions?.length || base.questionCount,
  };
}

export async function listCatalogExams(includeHidden = false): Promise<CatalogExam[]> {
  const result = await database().prepare(
    "SELECT subject_id AS subjectId, title, description, questions_json AS questionsJson, is_visible AS isVisible FROM catalog_exam_overrides WHERE teacher_id = ?",
  ).bind(THANAKORN_TEACHER_ID).all<OverrideRow>();
  const overrides = new Map((result.results ?? []).map((row) => [row.subjectId, row]));
  return examSubjects
    .map((subject) => mergedExam(subject.id, overrides.get(subject.id)))
    .filter((exam) => includeHidden || exam.visible);
}

export async function getCatalogExam(subjectId: string) {
  if (!isExamSubjectId(subjectId)) return null;
  const row = await database().prepare(
    "SELECT subject_id AS subjectId, title, description, questions_json AS questionsJson, is_visible AS isVisible FROM catalog_exam_overrides WHERE subject_id = ? AND teacher_id = ? LIMIT 1",
  ).bind(subjectId, THANAKORN_TEACHER_ID).first<OverrideRow>();
  const exam = mergedExam(subjectId, row ?? undefined);
  return exam.visible ? exam : null;
}

export async function saveCatalogExam(input: { id: string; title: string; description: string; questions: UploadedQuestion[] }) {
  if (!isExamSubjectId(input.id)) return false;
  await database().prepare(
    "INSERT INTO catalog_exam_overrides (subject_id, teacher_id, title, description, questions_json, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(subject_id) DO UPDATE SET teacher_id = excluded.teacher_id, title = excluded.title, description = excluded.description, questions_json = excluded.questions_json, is_visible = 1, updated_at = CURRENT_TIMESTAMP",
  ).bind(input.id, THANAKORN_TEACHER_ID, input.title, input.description, JSON.stringify(input.questions)).run();
  return true;
}

export async function hideCatalogExam(subjectId: string) {
  if (!isExamSubjectId(subjectId)) return false;
  const current = await getCatalogExam(subjectId);
  const base = current ?? baseExam(subjectId);
  await database().prepare(
    "INSERT INTO catalog_exam_overrides (subject_id, teacher_id, title, description, questions_json, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(subject_id) DO UPDATE SET is_visible = 0, updated_at = CURRENT_TIMESTAMP",
  ).bind(subjectId, THANAKORN_TEACHER_ID, base.title, base.description, JSON.stringify(base.questions)).run();
  return true;
}

export async function restoreCatalogExam(subjectId: string) {
  if (!isExamSubjectId(subjectId)) return false;
  const result = await database().prepare(
    "UPDATE catalog_exam_overrides SET is_visible = 1, updated_at = CURRENT_TIMESTAMP WHERE subject_id = ? AND teacher_id = ?",
  ).bind(subjectId, THANAKORN_TEACHER_ID).run();
  return result.meta.changes === 1;
}
