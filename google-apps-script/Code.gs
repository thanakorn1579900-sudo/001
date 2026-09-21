const SPREADSHEET_ID = "1amRMhO3g2RIZMlskVL0yIp4AfxWFgVcnI_G2lF7MKa0";

const HEADERS = [
  "ส่งเมื่อ",
  "ชื่อ - นามสกุล",
  "ชั้น / ห้อง",
  "รหัสนักศึกษา",
  "รายวิชา",
  "คะแนน",
  "คะแนนเต็ม",
  "ร้อยละ",
  "ตอบแล้ว",
  "แจ้งเตือน",
  "เวลาที่ใช้ (วินาที)",
  "เริ่มทำข้อสอบ",
];

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getTeacherSheet_(spreadsheet, payload.teacher);
    sheet.appendRow([
      payload.submittedAt || new Date().toISOString(),
      payload.name || "",
      payload.classLevel || "",
      payload.studentId || "",
      payload.subject || "",
      Number(payload.score) || 0,
      Number(payload.total) || 0,
      Number(payload.percent) || 0,
      Number(payload.answered) || 0,
      Number(payload.warnings) || 0,
      Number(payload.elapsedSeconds) || 0,
      payload.startedAt || "",
    ]);
    return json_({ ok: true, sheet: sheet.getName() });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet() {
  return ContentService.createTextOutput("Exam score endpoint ready");
}

function getTeacherSheet_(spreadsheet, teacherName) {
  const sheetName = safeSheetName_(teacherName || "คะแนนสอบ");
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function safeSheetName_(value) {
  const clean = String(value)
    .replace(/[\[\]*?\/\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return clean || "คะแนนสอบ";
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
