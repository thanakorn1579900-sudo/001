const SPREADSHEET_ID = "1amRMhO3g2RIZMlskVL0yIp4AfxWFgVcnI_G2lF7MKa0";
const SHEET_NAME = "ผลสอบ";
const HEADERS = [
  "ส่งเมื่อ",
  "ชื่อ - นามสกุล",
  "ชั้น / ห้อง",
  "รหัสนักศึกษา",
  "คะแนน",
  "จำนวนข้อ",
  "ร้อยละ",
  "ตอบแล้ว",
  "การเตือน",
  "เวลาที่ใช้ (วินาที)",
  "เริ่มสอบ",
];

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData && event.postData.contents || "{}");
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      payload.submittedAt || new Date().toISOString(),
      payload.name || "",
      payload.classLevel || "",
      payload.studentId || "",
      payload.score || 0,
      payload.total || 0,
      payload.percent || 0,
      payload.answered || 0,
      payload.warnings || 0,
      payload.elapsedSeconds || 0,
      payload.startedAt || "",
    ]);

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function doGet() {
  return ContentService.createTextOutput("Exam score endpoint ready");
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
