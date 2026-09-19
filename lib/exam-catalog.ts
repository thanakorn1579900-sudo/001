import { examQuestions } from "@/lib/exam-data";
import { drivingExamQuestions } from "@/lib/driving-exam-data";
import { fuelLubricantsExamQuestions } from "@/lib/fuel-lubricants-exam-data";
import { defaultExamSubjectId, type ExamSubjectId, getExamSubjectInfo } from "@/lib/exam-subjects";

export const examCatalog = {
  "automotive-electronics": {
    title: "แบบทดสอบงานอิเล็กทรอนิกส์รถยนต์เบื้องต้น",
    questions: examQuestions,
  },
  driving: {
    title: "แบบทดสอบงานขับรถยนต์",
    questions: drivingExamQuestions,
  },
  "fuel-lubricants": {
    title: "แบบทดสอบเชื้อเพลิงและวัสดุหล่อลื่น",
    questions: fuelLubricantsExamQuestions,
  },
} as const;

export function getExam(id: ExamSubjectId = defaultExamSubjectId) {
  const subject = getExamSubjectInfo(id);
  return { subject, ...examCatalog[id] };
}
