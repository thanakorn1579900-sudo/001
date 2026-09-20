import { env } from "cloudflare:workers";

export type UploadedOption = { label: string; text: string };
export type UploadedQuestion = { id: number; question: string; options: UploadedOption[]; answer: string };
export type UploadedExamSummary = {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  sourceFileName: string;
  createdAt: string;
};

type StoredExamRow = UploadedExamSummary & { questionsJson: string };
type StoredAdminExamRow = StoredExamRow & { sourceObjectKey: string };

function database() {
  if (!env.DB) throw new Error("ไม่พบฐานข้อมูลของระบบสอบ");
  return env.DB;
}

export function uploadsBucket() {
  if (!env.BUCKET) throw new Error("ยังไม่พร้อมใช้งานพื้นที่เก็บไฟล์ข้อสอบ");
  return env.BUCKET;
}

function isQuestion(value: unknown): value is UploadedQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<UploadedQuestion>;
  return typeof question.id === "number"
    && typeof question.question === "string"
    && typeof question.answer === "string"
    && Array.isArray(question.options)
    && question.options.length >= 2
    && question.options.every((option) => Boolean(option) && typeof option.label === "string" && typeof option.text === "string");
}

export function normalizeUploadedQuestions(value: unknown): UploadedQuestion[] | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 200 || !parsed.every(isQuestion)) return null;
    const questions = parsed.map((question, index) => ({
      id: index + 1,
      question: question.question.trim().slice(0, 2_000),
      options: question.options.map((option) => ({ label: option.label.trim().slice(0, 12), text: option.text.trim().slice(0, 1_000) })),
      answer: question.answer.trim().slice(0, 12),
    }));
    return questions.every((question) => question.question
      && question.options.length >= 2
      && new Set(question.options.map((option) => option.label)).size === question.options.length
      && question.options.every((option) => option.label && option.text)
      && question.options.some((option) => option.label === question.answer)) ? questions : null;
  } catch {
    return null;
  }
}

export async function listUploadedExamSummaries(): Promise<UploadedExamSummary[]> {
  const result = await database()
    .prepare("SELECT id, title, description, question_count AS questionCount, source_file_name AS sourceFileName, created_at AS createdAt FROM uploaded_exams ORDER BY created_at DESC")
    .all<UploadedExamSummary>();
  return result.results ?? [];
}

export async function getUploadedExam(id: string) {
  const row = await database()
    .prepare("SELECT id, title, description, question_count AS questionCount, source_file_name AS sourceFileName, created_at AS createdAt, questions_json AS questionsJson FROM uploaded_exams WHERE id = ? LIMIT 1")
    .bind(id)
    .first<StoredExamRow>();
  if (!row) return null;
  const questions = normalizeUploadedQuestions(row.questionsJson);
  if (!questions?.length) return null;
  return {
    subject: {
      id: row.id,
      title: row.title,
      description: row.description,
      questionCount: row.questionCount,
    },
    title: row.title,
    questions,
  };
}

export async function getUploadedExamForAdmin(id: string) {
  const row = await database()
    .prepare("SELECT id, title, description, question_count AS questionCount, source_file_name AS sourceFileName, created_at AS createdAt, source_object_key AS sourceObjectKey, questions_json AS questionsJson FROM uploaded_exams WHERE id = ? LIMIT 1")
    .bind(id)
    .first<StoredAdminExamRow>();
  if (!row) return null;
  const questions = normalizeUploadedQuestions(row.questionsJson);
  return questions ? { ...row, questions } : null;
}

export async function saveUploadedExam(input: {
  id: string;
  title: string;
  description: string;
  sourceFileName: string;
  sourceObjectKey: string;
  questions: UploadedQuestion[];
}) {
  await database()
    .prepare("INSERT INTO uploaded_exams (id, title, description, source_file_name, source_object_key, question_count, questions_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
    .bind(
      input.id,
      input.title,
      input.description,
      input.sourceFileName,
      input.sourceObjectKey,
      input.questions.length,
      JSON.stringify(input.questions),
    )
    .run();
}

export async function updateUploadedExam(input: { id: string; title: string; description: string; questions: UploadedQuestion[] }) {
  await database()
    .prepare("UPDATE uploaded_exams SET title = ?, description = ?, question_count = ?, questions_json = ? WHERE id = ?")
    .bind(input.title, input.description, input.questions.length, JSON.stringify(input.questions), input.id)
    .run();
}

export async function deleteUploadedExam(id: string) {
  await database().prepare("DELETE FROM uploaded_exams WHERE id = ?").bind(id).run();
}
