import ExcelJS from "exceljs";

export function createImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rosterly";
  workbook.subject = "Anonymized roster source data template";
  workbook.properties.date1904 = false;
  const sheets: Record<string, string[]> = {
    ReadMe: ["Sheet", "Required columns", "Notes"],
    Pods: ["externalKey", "name", "leadEmployeeKey"],
    Employees: ["externalKey", "name", "podKey", "weeklyOffDays", "mandatoryOffDays", "maxDailyMinutes", "active"],
    Brands: ["externalKey", "name", "podKey", "active"],
    Processes: ["externalKey", "brandKey", "name", "operatingDays", "holidayMode", "minStaff", "startTime", "endTime", "active"],
    ProcessRules: ["processKey", "weekday", "isOpen", "minStaff"],
    Eligibility: ["employeeKey", "processKey", "validFrom", "validUntil", "isBackup"],
    Availability: ["employeeKey", "type", "startDate", "endDate", "status", "note"],
    Holidays: ["date", "name", "region"],
  };
  const notes = [
    ["ReadMe", "Sheet names and headers are case-insensitive. Keep identifiers stable between sheets.", "No example names or real employee data are included."],
    ["Pods", "externalKey, name", "leadEmployeeKey is optional and points to Employees.externalKey."],
    ["Employees", "externalKey, name, podKey", "Days accept Mon,Wed or ISO weekdays 1–7 (Mon=1, Sun=7)."],
    ["Brands", "externalKey, name", "podKey may be blank for shared brands. active defaults to true."],
    ["Processes", "externalKey, brandKey, name", "Times use 24-hour HH:MM. operatingDays accepts weekday names or 1–7. active defaults to true."],
    ["ProcessRules", "processKey, weekday, isOpen, minStaff", "Optional per-weekday override. Leave sheet empty to use Processes defaults."],
    ["Eligibility", "employeeKey, processKey", "Dates use YYYY-MM-DD; blank validFrom means 1970-01-01."],
    ["Availability", "employeeKey, type, startDate, endDate", "Types: LEAVE, COMP_OFF, UNAVAILABLE. Status defaults to PENDING."],
    ["Holidays", "date, name", "Dates use YYYY-MM-DD; region defaults to GLOBAL."],
  ];
  for (const [name, headers] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    if (name === "ReadMe") {
      sheet.addRow(headers);
      notes.forEach((row) => sheet.addRow(row));
    } else sheet.addRow(headers);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF39345F" } };
    sheet.columns.forEach((column) => { column.width = Math.min(32, Math.max(16, String(column.header ?? "").length + 4)); });
  }
  return workbook;
}
