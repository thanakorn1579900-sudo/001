import type { UploadedOption, UploadedQuestion } from "@/lib/uploaded-exams";

type ParsedUpload = { questions: UploadedQuestion[]; suggestedTitle: string };
type RawQuestion = { question?: unknown; options?: unknown; answer?: unknown; correctAnswer?: unknown; "เฉลย"?: unknown };

const thaiLabels = ["ก", "ข", "ค", "ง", "จ", "ฉ"];
const decode = new TextDecoder();

function text(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function safeTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return text(withoutExtension, 160) || "ข้อสอบที่อัปโหลด";
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function optionLabel(value: unknown, index: number) {
  const candidate = text(value, 8).replace(/[.)]/g, "");
  return candidate || thaiLabels[index] || String(index + 1);
}

function answerFor(value: unknown, options: UploadedOption[]) {
  const candidate = text(String(value ?? ""), 60).replace(/^ข้อ\s*/i, "").replace(/[.)\s]/g, "");
  if (!candidate) return "";
  const direct = options.find((option) => option.label.toLowerCase() === candidate.toLowerCase());
  if (direct) return direct.label;
  const letterIndex = "abcdef".indexOf(candidate.toLowerCase());
  if (letterIndex >= 0 && options[letterIndex]) return options[letterIndex].label;
  const number = Number(candidate);
  if (Number.isInteger(number) && number >= 1 && options[number - 1]) return options[number - 1].label;
  return "";
}

function normalizeQuestion(raw: RawQuestion, index: number): UploadedQuestion | null {
  const question = text(raw.question);
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions.map((value, optionIndex) => {
    if (value && typeof value === "object") {
      const option = value as Partial<UploadedOption>;
      return { label: optionLabel(option.label, optionIndex), text: text(option.text) };
    }
    return { label: thaiLabels[optionIndex] || String(optionIndex + 1), text: text(value) };
  }).filter((option) => option.text);
  const answer = answerFor(raw.answer ?? raw.correctAnswer ?? raw["เฉลย"], options);
  if (!question || options.length < 2 || !answer || new Set(options.map((option) => option.label)).size !== options.length) return null;
  return { id: index + 1, question, options, answer };
}

function parseJson(source: string, fileName: string): ParsedUpload {
  const parsed = JSON.parse(source) as { title?: unknown; questions?: unknown } | unknown[];
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = items.map((item, index) => normalizeQuestion((item ?? {}) as RawQuestion, index)).filter((item): item is UploadedQuestion => Boolean(item));
  const title = !Array.isArray(parsed) ? text(parsed.title, 160) : "";
  return { questions, suggestedTitle: title || safeTitle(fileName) };
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; } else quoted = !quoted;
    } else if (character === delimiter && !quoted) { values.push(current.trim()); current = ""; } else current += character;
  }
  values.push(current.trim());
  return values;
}

function parseCsv(source: string, fileName: string): ParsedUpload {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { questions: [], suggestedTitle: safeTitle(fileName) };
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = lines.map((line) => splitCsvLine(line, delimiter));
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s_-]/g, ""));
  const hasHeader = headers.some((header) => /question|คำถาม|โจทย์/.test(header));
  const findColumn = (patterns: RegExp[], fallback: number) => {
    const found = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return found >= 0 ? found : fallback;
  };
  const questionColumn = findColumn([/question/, /คำถาม/, /โจทย์/], 0);
  const optionColumns = [
    findColumn([/option1/, /choice1/, /^a$/, /ตัวเลือกก/], 1),
    findColumn([/option2/, /choice2/, /^b$/, /ตัวเลือกข/], 2),
    findColumn([/option3/, /choice3/, /^c$/, /ตัวเลือกค/], 3),
    findColumn([/option4/, /choice4/, /^d$/, /ตัวเลือกง/], 4),
  ];
  const answerColumn = findColumn([/answer/, /correct/, /เฉลย/, /คำตอบ/], 5);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const questions = dataRows.map((row, index) => normalizeQuestion({
    question: row[questionColumn],
    options: optionColumns.map((column) => row[column]),
    answer: row[answerColumn],
  }, index)).filter((item): item is UploadedQuestion => Boolean(item));
  return { questions, suggestedTitle: safeTitle(fileName) };
}

function parseText(source: string, fileName: string): ParsedUpload {
  const clean = decodeEntities(source.replace(/\r/g, "").replace(/\u00a0/g, " "));
  const answerMarker = clean.search(/(?:^|\n)\s*(?:เฉลย|คำตอบ|answer(?:\s*key)?)/im);
  const questionText = answerMarker >= 0 ? clean.slice(0, answerMarker) : clean;
  const keyText = answerMarker >= 0 ? clean.slice(answerMarker) : "";
  const answers = new Map<number, string>();
  for (const line of keyText.split("\n")) {
    const match = line.match(/^\s*(?:ข้อ\s*)?(\d+)\s*[.)\-:]?\s*([กขคงA-Da-d])\s*$/i);
    if (match) answers.set(Number(match[1]), match[2]);
  }
  const starts = [...questionText.matchAll(/^\s*(?:ข้อ\s*)?(\d+)\s*[.)]\s*(.+)$/gim)];
  const questions: UploadedQuestion[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const questionNumber = Number(match[1]);
    const begin = match.index ?? 0;
    const end = index + 1 < starts.length ? (starts[index + 1].index ?? questionText.length) : questionText.length;
    const block = questionText.slice(begin, end);
    const lines = block.split("\n");
    const optionStart = lines.findIndex((line) => /^\s*([กขคงA-Da-d])\s*[.)]\s+(.+)$/i.test(line));
    if (optionStart < 0) continue;
    const question = [match[2], ...lines.slice(1, optionStart)].join(" ");
    const options: UploadedOption[] = lines.slice(optionStart)
      .map((line) => line.match(/^\s*([กขคงA-Da-d])\s*[.)]\s+(.+)$/i))
      .filter((item): item is RegExpMatchArray => Boolean(item))
      .map((item) => ({ label: item[1], text: text(item[2]) }));
    const inlineAnswer = block.match(/(?:เฉลย|คำตอบ|answer)\s*[:\-]?\s*([กขคงA-Da-d])/i)?.[1];
    const answer = answerFor(inlineAnswer || answers.get(questionNumber), options);
    const normalized = normalizeQuestion({ question, options, answer }, questions.length);
    if (normalized) questions.push(normalized);
  }
  return { questions, suggestedTitle: safeTitle(fileName) };
}

function findDocxEntry(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) !== 0x06054b50) continue;
    let cursor = view.getUint32(index + 16, true);
    const entries = view.getUint16(index + 10, true);
    for (let count = 0; count < entries; count += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ไฟล์ DOCX ไม่สมบูรณ์");
      const compression = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decode.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      if (name === "word/document.xml") {
        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("ไฟล์ DOCX ไม่สมบูรณ์");
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        return { compression, data: bytes.slice(dataStart, dataStart + compressedSize) };
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
  }
  throw new Error("ไม่พบเนื้อหาในไฟล์ DOCX");
}

async function parseDocx(bytes: Uint8Array, fileName: string): Promise<ParsedUpload> {
  const entry = findDocxEntry(bytes);
  let xmlBytes = entry.data;
  if (entry.compression === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("ระบบยังไม่รองรับการอ่านไฟล์ DOCX ขณะนี้");
    const stream = new Blob([xmlBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (entry.compression !== 0) {
    throw new Error("รูปแบบการบีบอัดในไฟล์ DOCX ไม่รองรับ");
  }
  const xml = decode.decode(xmlBytes)
    .replace(/<w:tab[^/]*\/>/g, " ")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return parseText(xml, fileName);
}

export async function parseExamUpload(fileName: string, content: ArrayBuffer): Promise<ParsedUpload> {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "json") return parseJson(decode.decode(content), fileName);
  if (extension === "csv") return parseCsv(decode.decode(content), fileName);
  if (extension === "txt") return parseText(decode.decode(content), fileName);
  if (extension === "docx") return parseDocx(new Uint8Array(content), fileName);
  if (extension === "doc") throw new Error("กรุณาบันทึกไฟล์ Word แบบเก่า (.doc) เป็น .docx ก่อนอัปโหลด");
  throw new Error("รองรับไฟล์ .docx, .txt, .csv และ .json เท่านั้น");
}
