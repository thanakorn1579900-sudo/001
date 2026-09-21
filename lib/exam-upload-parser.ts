import type { UploadedOption, UploadedQuestion } from "@/lib/uploaded-exams";

export type UploadDiagnostics = {
  sourceFormat: "DOCX" | "TXT" | "CSV" | "JSON";
  candidates: number;
  accepted: number;
  incomplete: number[];
  answersFound: number;
};

export type ParsedUpload = {
  questions: UploadedQuestion[];
  suggestedTitle: string;
  diagnostics: UploadDiagnostics;
};

type RawQuestion = Record<string, unknown>;
type DraftQuestion = { number: number; question: string[]; options: UploadedOption[]; inlineAnswer?: string; markedAnswers: string[] };

const thaiLabels = ["ก", "ข", "ค", "ง", "จ", "ฉ"];
const decode = new TextDecoder();
const acceptedLabels = "กขคงจฉA-Fa-f1-6";
const numberCharacters = "0-9๐-๙";
// Private-use markers survive DOCX-to-text conversion without appearing in saved questions.
const markedStart = "\uE000";
const markedEnd = "\uE001";

function withoutMarkers(value: string) {
  return value.replaceAll(markedStart, "").replaceAll(markedEnd, "");
}

function isMarked(value: string) {
  return value.includes(markedStart);
}

function questionNumber(value: string) {
  const arabic = value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
  const number = Number(arabic);
  return Number.isInteger(number) && number > 0 && number <= 999 ? number : 0;
}

function text(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? withoutMarkers(value).replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
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
  const candidate = text(value, 12).replace(/[.)、:：\s]/g, "");
  if (/^[a-f]$/i.test(candidate)) return candidate.toUpperCase();
  return candidate || thaiLabels[index] || String(index + 1);
}

function answerFor(value: unknown, options: UploadedOption[]) {
  const candidate = text(String(value ?? ""), 60)
    .replace(/^(?:ข้อ|answer|correct|คำตอบ|เฉลย)\s*/i, "")
    .replace(/[.)、:：\s()\[\]]/g, "");
  if (!candidate) return "";
  const direct = options.find((option) => option.label.toLowerCase() === candidate.toLowerCase());
  if (direct) return direct.label;
  const letterIndex = "abcdef".indexOf(candidate.toLowerCase());
  if (letterIndex >= 0 && options[letterIndex]) return options[letterIndex].label;
  const number = Number(candidate);
  if (Number.isInteger(number) && number >= 1 && options[number - 1]) return options[number - 1].label;
  return "";
}

function optionsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([label, option]) => ({ label, text: option }));
  }
  return [];
}

function normalizeQuestion(raw: RawQuestion, index: number): UploadedQuestion | null {
  const question = text(raw.question ?? raw.text ?? raw.prompt ?? raw["คำถาม"] ?? raw["โจทย์"]);
  const rawOptions = optionsFrom(raw.options ?? raw.choices ?? raw.answers ?? raw["ตัวเลือก"]);
  const options = rawOptions.map((value, optionIndex) => {
    if (value && typeof value === "object") {
      const option = value as Partial<UploadedOption> & { value?: unknown; answer?: unknown };
      return { label: optionLabel(option.label, optionIndex), text: text(option.text ?? option.value ?? option.answer) };
    }
    return { label: thaiLabels[optionIndex] || String(optionIndex + 1), text: text(value) };
  }).filter((option) => option.text);
  const answer = answerFor(raw.answer ?? raw.correctAnswer ?? raw.correct ?? raw.answerKey ?? raw["เฉลย"] ?? raw["คำตอบ"], options);
  if (!question || options.length < 2 || !answer || new Set(options.map((option) => option.label)).size !== options.length) return null;
  return { id: index + 1, question, options, answer };
}

function diagnostics(sourceFormat: UploadDiagnostics["sourceFormat"], candidates: number, questions: UploadedQuestion[], incomplete: number[], answersFound: number): UploadDiagnostics {
  return { sourceFormat, candidates, accepted: questions.length, incomplete, answersFound };
}

function parseJson(source: string, fileName: string): ParsedUpload {
  const parsed = JSON.parse(source) as Record<string, unknown> | unknown[];
  const items = Array.isArray(parsed) ? parsed : optionsFrom(parsed.questions ?? parsed.items ?? parsed["ข้อสอบ"]);
  const questions = items.map((item, index) => normalizeQuestion((item ?? {}) as RawQuestion, index)).filter((item): item is UploadedQuestion => Boolean(item));
  const title = !Array.isArray(parsed) ? text(parsed.title ?? parsed.name ?? parsed.subject ?? parsed["ชื่อวิชา"], 160) : "";
  const incomplete = items.flatMap((item, index) => normalizeQuestion((item ?? {}) as RawQuestion, index) ? [] : [index + 1]);
  return { questions, suggestedTitle: title || safeTitle(fileName), diagnostics: diagnostics("JSON", items.length, questions, incomplete, questions.length) };
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
  if (!lines.length) return { questions: [], suggestedTitle: safeTitle(fileName), diagnostics: diagnostics("CSV", 0, [], [], 0) };
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = lines.map((line) => splitCsvLine(line, delimiter));
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s_\-().]/g, ""));
  const hasHeader = headers.some((header) => /question|คำถาม|โจทย์|ข้อสอบ/.test(header));
  const findColumn = (patterns: RegExp[], fallback: number) => {
    const found = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return found >= 0 ? found : fallback;
  };
  const questionColumn = findColumn([/question/, /คำถาม/, /โจทย์/, /ข้อสอบ/], 0);
  const optionColumns = [
    findColumn([/option1$/, /choice1$/, /^a$/, /^ก$/, /ตัวเลือก(?:ที่)?1$/, /ตัวเลือกก$/, /ข้อก$/], 1),
    findColumn([/option2$/, /choice2$/, /^b$/, /^ข$/, /ตัวเลือก(?:ที่)?2$/, /ตัวเลือกข$/, /ข้อข$/], 2),
    findColumn([/option3$/, /choice3$/, /^c$/, /^ค$/, /ตัวเลือก(?:ที่)?3$/, /ตัวเลือกค$/, /ข้อค$/], 3),
    findColumn([/option4$/, /choice4$/, /^d$/, /^ง$/, /ตัวเลือก(?:ที่)?4$/, /ตัวเลือกง$/, /ข้อง$/], 4),
    findColumn([/option5$/, /choice5$/, /^e$/, /^จ$/, /ตัวเลือก(?:ที่)?5$/, /ตัวเลือกจ$/, /ข้อจ$/], -1),
    findColumn([/option6$/, /choice6$/, /^f$/, /^ฉ$/, /ตัวเลือก(?:ที่)?6$/, /ตัวเลือกฉ$/, /ข้อฉ$/], -1),
  ].filter((column) => column >= 0);
  const answerColumn = findColumn([/answer/, /correct/, /เฉลย/, /คำตอบ/, /key/], 5);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const raw = dataRows.map((row) => ({ question: row[questionColumn], options: optionColumns.map((column) => row[column]), answer: row[answerColumn] }));
  const questions = raw.map((item, index) => normalizeQuestion(item, index)).filter((item): item is UploadedQuestion => Boolean(item));
  const incomplete = raw.flatMap((item, index) => normalizeQuestion(item, index) ? [] : [index + 1]);
  return { questions, suggestedTitle: safeTitle(fileName), diagnostics: diagnostics("CSV", raw.length, questions, incomplete, questions.length) };
}

function lineOption(line: string) {
  const marked = isMarked(line);
  const cleaned = withoutMarkers(line).replace(/^\s*[-•▪◦*]\s*/, "").trim();
  const match = cleaned.match(new RegExp(`^\\(?\\s*([${acceptedLabels}])\\s*\\)?\\s*(?:[.)、:：\\-]|\\s+)\\s*(.+)$`, "i"));
  if (!match) return null;
  const label = optionLabel(match[1], 0);
  return { label, text: text(match[2]), numeric: /^\d$/.test(label), marked };
}

function lineQuestion(line: string) {
  const cleaned = withoutMarkers(line).trim();
  const explicit = cleaned.match(new RegExp(`^\\s*(ข้อ(?:ที่)?\\s*)[\\[(]?\\s*([${numberCharacters}]{1,3})\\s*(?:(?:[.)\\]、:：\\-]+)\\s*|\\s+|(?=[ก-๙]))(.+)$`, "i"));
  if (explicit) {
    const number = questionNumber(explicit[2]);
    return number ? { number, question: text(explicit[3]), explicit: true } : null;
  }
  const plain = cleaned.match(new RegExp(`^\\s*[\\[(]?\\s*([${numberCharacters}]{1,3})\\s*(?:[.)\\]、:：\\-]+\\s*|\\s+)(.+)$`, "i"));
  if (!plain) return null;
  const number = questionNumber(plain[1]);
  return number ? { number, question: text(plain[2]), explicit: false } : null;
}

function answerMapFrom(source: string) {
  const answers = new Map<number, string>();
  const compact = withoutMarkers(source).replace(/\r/g, "\n");
  const keyed = new RegExp(`(?:ข้อ(?:ที่)?\\s*)?([${numberCharacters}]{1,3})\\s*(?:[.)、:：\\-=]|\\s)*\\s*(?:เฉลย|คำตอบ|answer|ans\\.?|correct)?\\s*[:：\\-]?\\s*\\(?\\s*([${acceptedLabels}])\\s*\\)?(?:\\s*[.)、:：\\-])?(?=$|[\\s,;|])`, "gi");
  for (const match of compact.matchAll(keyed)) {
    const number = questionNumber(match[1]);
    if (number) answers.set(number, optionLabel(match[2], 0));
  }
  return answers;
}

function parseText(source: string, fileName: string, sourceFormat: "TXT" | "DOCX" = "TXT"): ParsedUpload {
  const clean = decodeEntities(source.replace(/\r/g, "").replace(/\u00a0/g, " "));
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const answerStart = lines.findIndex((line) => /^(?:(?:เฉลย|คำตอบ)(?:\s|[:：\-]|แบบ|ข้อ|รวม|$)|answer(?:\s*key)?\b|correct\s*answers?\b)/i.test(withoutMarkers(line)));
  const questionLines = answerStart >= 0 ? lines.slice(0, answerStart) : lines;
  const answerLines = answerStart >= 0 ? lines.slice(answerStart) : [];
  const answers = answerMapFrom(answerLines.join("\n"));
  const questions: UploadedQuestion[] = [];
  const incomplete: number[] = [];
  let candidates = 0;
  let current: DraftQuestion | null = null;

  const finish = () => {
    if (!current) return;
    const normalized = normalizeQuestion({
      question: current.question.join(" "),
      options: current.options,
      // An explicit inline key or an answer-key section wins over presentation styling.
      answer: current.inlineAnswer || answers.get(current.number) || (current.markedAnswers.length === 1 ? current.markedAnswers[0] : ""),
    }, questions.length);
    if (normalized) questions.push(normalized); else incomplete.push(current.number);
    current = null;
  };

  for (const line of questionLines) {
    const cleanLine = withoutMarkers(line);
    const inline = cleanLine.match(new RegExp(`(?:เฉลย|คำตอบ|answer|ans\\.?|correct)\\s*[:：\\-]?\\s*\\(?\\s*([${acceptedLabels}])`, "i"));
    if (current && inline) { current.inlineAnswer = optionLabel(inline[1], 0); continue; }
    const option = lineOption(line);
    const header = lineQuestion(line);
    const expectedOptionNumber = current ? current.options.length + 1 : 0;
    const hasReliableCurrentAnswer = Boolean(current && (current.inlineAnswer || answers.get(current.number) || current.markedAnswers.length === 1));
    const startsNewQuestion = Boolean(header && (!current
      || !option
      || !option.numeric
      || Number(option.label) !== expectedOptionNumber
      || header.explicit
      || (header.number === current.number + 1 && current.options.length >= 2 && hasReliableCurrentAnswer)));
    if (header && startsNewQuestion) {
      finish();
      candidates += 1;
      current = { number: header.number, question: [header.question], options: [], markedAnswers: [] };
      continue;
    }
    if (current && option) {
      if (!option.numeric || Number(option.label) === expectedOptionNumber) {
        current.options.push({ label: option.label, text: option.text });
        if (option.marked && !current.markedAnswers.includes(option.label)) current.markedAnswers.push(option.label);
        continue;
      }
    }
    if (current && !option) {
      current.question.push(line);
    }
  }
  finish();
  return { questions, suggestedTitle: safeTitle(fileName), diagnostics: diagnostics(sourceFormat, candidates, questions, incomplete, answers.size) };
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

function isRed(value: string) {
  const color = value.replace(/^#/, "").toUpperCase();
  if (/^(?:RED|DARKRED)$/.test(color)) return true;
  if (!/^[\dA-F]{6}$/.test(color)) return false;
  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);
  return red >= 150 && red >= green * 1.6 && red >= blue * 1.6 && green <= 120 && blue <= 120;
}

function isAnswerMarkedDocxRun(run: string) {
  const color = run.match(/<w:color\b[^>]*?\bw:val\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1];
  if (color && isRed(color)) return true;
  if (/<w:highlight\b[^>]*?\bw:val\s*=\s*["'](?:red|darkRed)["'][^>]*>/i.test(run)) return true;
  // Word's "All caps" and "Small caps" formatting are explicit author intent;
  // use them as an answer marker without guessing from ordinary capital letters.
  return /<w:(?:caps|smallCaps)\b[^>]*?(?:\/>|\bw:val\s*=\s*["'](?:1|true|on)["'][^>]*>)/i.test(run);
}

function docxTextWithAnswerMarkers(xml: string) {
  const withRuns = xml.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (run) => {
    const runText = run
      .replace(/<w:tab\b[^>]*\/>/g, " ")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<w:t\b[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, "");
    return runText && isAnswerMarkedDocxRun(run) ? `${markedStart}${runText}${markedEnd}` : runText;
  });
  return withRuns
    .replace(/<w:tab\b[^>]*\/>/g, " ")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, " ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
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
  const xml = docxTextWithAnswerMarkers(decode.decode(xmlBytes));
  return parseText(xml, fileName, "DOCX");
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
