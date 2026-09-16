export const examSubjects = [
  {
    id: "automotive-electronics",
    title: "งานอิเล็กทรอนิกส์รถยนต์เบื้องต้น",
    description: "วงจรไฟฟ้า เซ็นเซอร์ และการตรวจสอบระบบรถยนต์",
    questionCount: 40,
  },
  {
    id: "driving",
    title: "งานขับรถยนต์",
    description: "กฎจราจร การขับขี่ปลอดภัย และการบำรุงรักษารถยนต์",
    questionCount: 50,
  },
] as const;

export type ExamSubjectId = (typeof examSubjects)[number]["id"];

export const defaultExamSubjectId: ExamSubjectId = "automotive-electronics";

export function isExamSubjectId(value: string | null | undefined): value is ExamSubjectId {
  return examSubjects.some((subject) => subject.id === value);
}

export function getExamSubjectInfo(id: ExamSubjectId) {
  return examSubjects.find((subject) => subject.id === id)!;
}
