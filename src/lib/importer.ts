import "server-only";
import ExcelJS from "exceljs";
import { HttpError } from "@/lib/http";

export type ImportData = {
  pods: Array<{ externalKey: string; name: string; leadEmployeeKey: string | null }>;
  employees: Array<{ externalKey: string; name: string; podKey: string; weeklyOffDays: number[]; mandatoryOffDays: number[]; maxDailyMinutes: number; active: boolean }>;
  brands: Array<{ externalKey: string; name: string; podKey: string | null }>;
  processes: Array<{ externalKey: string; brandKey: string; name: string; operatingDays: number[]; holidayMode: "OPEN" | "CLOSED"; minStaff: number; startMinute: number; endMinute: number }>;
  rules: Array<{ processKey: string; weekday: number; isOpen: boolean; minStaff: number }>;
  eligibility: Array<{ employeeKey: string; processKey: string; validFrom: string; validUntil: string | null; isBackup: boolean }>;
  availability: Array<{ employeeKey: string; type: "LEAVE" | "COMP_OFF" | "UNAVAILABLE"; startDate: string; endDate: string; status: "PENDING" | "APPROVED" | "REJECTED"; note: string | null }>;
  holidays: Array<{ date: string; name: string; region: string }>;
};

export type ImportPreview = { data: ImportData; errors: string[]; rowCount: number; counts: Record<string, number> };

const DAY_NAMES: Record<string, number> = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
const emptyData = (): ImportData => ({ pods: [], employees: [], brands: [], processes: [], rules: [], eligibility: [], availability: [], holidays: [] });

function scalar(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    return "";
  }
  return String(value).trim();
}

function sheetRows(sheet: ExcelJS.Worksheet | undefined, errors: string[]) {
  if (!sheet) return [] as Array<{ line: number; row: Record<string, string> }>;
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(scalar(cell.value).toLowerCase(), column));
  const result: Array<{ line: number; row: Record<string, string> }> = [];
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    const values: Record<string, string> = {};
    for (const [name, column] of headers) values[name] = scalar(row.getCell(column).value);
    if (Object.values(values).some(Boolean)) result.push({ line, row: values });
  });
  if (headers.size === 0) errors.push(`${sheet.name}: add a header row before importing.`);
  return result;
}

function field(row: Record<string, string>, key: string, sheet: string, line: number, errors: string[], required = true) {
  const value = row[key.toLowerCase()]?.trim() ?? "";
  if (!value && required) errors.push(`${sheet} row ${line}: “${key}” is required.`);
  return value;
}

function dayList(value: string, sheet: string, line: number, fieldName: string, errors: string[]) {
  if (!value) return [];
  const parsed = value.split(/[;,|]/).map((item) => {
    const token = item.trim().toLowerCase();
    return DAY_NAMES[token] ?? (Number(token) >= 1 && Number(token) <= 7 ? Number(token) : NaN);
  });
  if (parsed.some((day) => Number.isNaN(day))) errors.push(`${sheet} row ${line}: ${fieldName} must use weekday names or ISO numbers 1–7.`);
  return [...new Set(parsed.filter((day) => !Number.isNaN(day)))];
}

function dateValue(value: string, sheet: string, line: number, fieldName: string, errors: string[], optional = false) {
  if (!value && optional) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.push(`${sheet} row ${line}: ${fieldName} must use YYYY-MM-DD.`);
    return "1970-01-01";
  }
  return value;
}

function integer(value: string, fallback: number, min: number, max: number, sheet: string, line: number, fieldName: string, errors: string[]) {
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    errors.push(`${sheet} row ${line}: ${fieldName} must be a whole number from ${min} to ${max}.`);
    return fallback;
  }
  return number;
}

function bool(value: string, fallback: boolean, sheet: string, line: number, fieldName: string, errors: string[]) {
  if (!value) return fallback;
  if (["true", "yes", "1", "active"].includes(value.toLowerCase())) return true;
  if (["false", "no", "0", "inactive"].includes(value.toLowerCase())) return false;
  errors.push(`${sheet} row ${line}: ${fieldName} must be true/false, yes/no, or 1/0.`);
  return fallback;
}

function timeMinutes(value: string, fallback: number, sheet: string, line: number, fieldName: string, errors: string[]) {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    errors.push(`${sheet} row ${line}: ${fieldName} must use 24-hour HH:MM time.`);
    return fallback;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function assertUnique(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) errors.push(`${label}: duplicate external key “${value}”.`);
    seen.add(value);
  }
}

function validateReferences(data: ImportData, errors: string[], existing: { pods: string[]; employees: string[]; brands: string[]; processes: string[] }) {
  const podKeys = new Set([...data.pods.map((item) => item.externalKey), ...existing.pods]);
  const employeeKeys = new Set([...data.employees.map((item) => item.externalKey), ...existing.employees]);
  const brandKeys = new Set([...data.brands.map((item) => item.externalKey), ...existing.brands]);
  const processKeys = new Set([...data.processes.map((item) => item.externalKey), ...existing.processes]);
  for (const item of data.employees) if (!podKeys.has(item.podKey)) errors.push(`Employees: pod key “${item.podKey}” does not exist on the Pods sheet.`);
  for (const item of data.brands) if (item.podKey && !podKeys.has(item.podKey)) errors.push(`Brands: pod key “${item.podKey}” does not exist on the Pods sheet.`);
  for (const item of data.pods) if (item.leadEmployeeKey && !employeeKeys.has(item.leadEmployeeKey)) errors.push(`Pods: lead employee key “${item.leadEmployeeKey}” does not exist on the Employees sheet.`);
  for (const item of data.processes) if (!brandKeys.has(item.brandKey)) errors.push(`Processes: brand key “${item.brandKey}” does not exist on the Brands sheet.`);
  for (const item of data.rules) if (!processKeys.has(item.processKey)) errors.push(`ProcessRules: process key “${item.processKey}” does not exist on the Processes sheet.`);
  for (const item of data.eligibility) {
    if (!employeeKeys.has(item.employeeKey)) errors.push(`Eligibility: employee key “${item.employeeKey}” does not exist on the Employees sheet.`);
    if (!processKeys.has(item.processKey)) errors.push(`Eligibility: process key “${item.processKey}” does not exist on the Processes sheet.`);
  }
  for (const item of data.availability) if (!employeeKeys.has(item.employeeKey)) errors.push(`Availability: employee key “${item.employeeKey}” does not exist on the Employees sheet.`);
}

export async function parseImport(fileName: string, bytes: Buffer, existing: { pods: string[]; employees: string[]; brands: string[]; processes: string[] } = { pods: [], employees: [], brands: [], processes: [] }): Promise<ImportPreview> {
  const errors: string[] = [];
  const data = emptyData();
  const ext = fileName.split(".").at(-1)?.toLowerCase();
  if (!ext || !["xlsx", "csv"].includes(ext)) throw new HttpError(400, "Upload an .xlsx workbook or a .csv employee file.");
  const workbook = new ExcelJS.Workbook();
  if (ext === "xlsx") await workbook.xlsx.load(bytes as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
  else {
    const rows = csvRows(bytes.toString("utf8"));
    if (!rows.length) errors.push("CSV: the file has no header row.");
    else {
      const headers = rows[0].map((item) => item.trim().toLowerCase());
      const sheet = workbook.addWorksheet("Employees");
      sheet.addRow(headers);
      for (const row of rows.slice(1)) sheet.addRow(row);
    }
  }

  const podRows = sheetRows(workbook.getWorksheet("Pods"), errors);
  data.pods = podRows.map(({ line, row }) => ({
    externalKey: field(row, "externalKey", "Pods", line, errors),
    name: field(row, "name", "Pods", line, errors),
    leadEmployeeKey: field(row, "leadEmployeeKey", "Pods", line, errors, false) || null,
  }));
  const employeeRows = sheetRows(workbook.getWorksheet("Employees"), errors);
  data.employees = employeeRows.map(({ line, row }) => ({
    externalKey: field(row, "externalKey", "Employees", line, errors),
    name: field(row, "name", "Employees", line, errors),
    podKey: field(row, "podKey", "Employees", line, errors),
    weeklyOffDays: dayList(field(row, "weeklyOffDays", "Employees", line, errors, false), "Employees", line, "weeklyOffDays", errors),
    mandatoryOffDays: dayList(field(row, "mandatoryOffDays", "Employees", line, errors, false), "Employees", line, "mandatoryOffDays", errors),
    maxDailyMinutes: integer(field(row, "maxDailyMinutes", "Employees", line, errors, false), 480, 60, 1440, "Employees", line, "maxDailyMinutes", errors),
    active: bool(field(row, "active", "Employees", line, errors, false), true, "Employees", line, "active", errors),
  }));
  const brandRows = sheetRows(workbook.getWorksheet("Brands"), errors);
  data.brands = brandRows.map(({ line, row }) => ({
    externalKey: field(row, "externalKey", "Brands", line, errors), name: field(row, "name", "Brands", line, errors),
    podKey: field(row, "podKey", "Brands", line, errors, false) || null,
  }));
  const processRows = sheetRows(workbook.getWorksheet("Processes"), errors);
  data.processes = processRows.map(({ line, row }) => {
    const startMinute = timeMinutes(field(row, "startTime", "Processes", line, errors, false), 540, "Processes", line, "startTime", errors);
    const endMinute = timeMinutes(field(row, "endTime", "Processes", line, errors, false), 1020, "Processes", line, "endTime", errors);
    if (startMinute >= endMinute) errors.push(`Processes row ${line}: endTime must be later than startTime on the same day.`);
    const holidayValue = field(row, "holidayMode", "Processes", line, errors, false).toUpperCase() || "CLOSED";
    if (!["OPEN", "CLOSED"].includes(holidayValue)) errors.push(`Processes row ${line}: holidayMode must be OPEN or CLOSED.`);
    return {
      externalKey: field(row, "externalKey", "Processes", line, errors), brandKey: field(row, "brandKey", "Processes", line, errors),
      name: field(row, "name", "Processes", line, errors),
      operatingDays: field(row, "operatingDays", "Processes", line, errors, false)
        ? dayList(field(row, "operatingDays", "Processes", line, errors, false), "Processes", line, "operatingDays", errors)
        : [1, 2, 3, 4, 5, 6],
      holidayMode: holidayValue === "OPEN" ? "OPEN" as const : "CLOSED" as const,
      minStaff: integer(field(row, "minStaff", "Processes", line, errors, false), 1, 1, 500, "Processes", line, "minStaff", errors),
      startMinute, endMinute,
    };
  });
  const ruleRows = sheetRows(workbook.getWorksheet("ProcessRules"), errors);
  data.rules = ruleRows.map(({ line, row }) => {
    const weekday = integer(field(row, "weekday", "ProcessRules", line, errors), 1, 1, 7, "ProcessRules", line, "weekday", errors);
    const open = bool(field(row, "isOpen", "ProcessRules", line, errors, false), true, "ProcessRules", line, "isOpen", errors);
    return { processKey: field(row, "processKey", "ProcessRules", line, errors), weekday, isOpen: open, minStaff: integer(field(row, "minStaff", "ProcessRules", line, errors, false), 1, 0, 500, "ProcessRules", line, "minStaff", errors) };
  });
  const eligibilityRows = sheetRows(workbook.getWorksheet("Eligibility"), errors);
  data.eligibility = eligibilityRows.map(({ line, row }) => {
    const validFrom = dateValue(field(row, "validFrom", "Eligibility", line, errors, false), "Eligibility", line, "validFrom", errors, true) ?? "1970-01-01";
    const validUntil = dateValue(field(row, "validUntil", "Eligibility", line, errors, false), "Eligibility", line, "validUntil", errors, true);
    if (validUntil && validUntil < validFrom) errors.push(`Eligibility row ${line}: validUntil must not be before validFrom.`);
    return { employeeKey: field(row, "employeeKey", "Eligibility", line, errors), processKey: field(row, "processKey", "Eligibility", line, errors), validFrom, validUntil, isBackup: bool(field(row, "isBackup", "Eligibility", line, errors, false), false, "Eligibility", line, "isBackup", errors) };
  });
  const availabilityRows = sheetRows(workbook.getWorksheet("Availability"), errors);
  data.availability = availabilityRows.map(({ line, row }) => {
    const typeValue = field(row, "type", "Availability", line, errors).toUpperCase();
    const statusValue = field(row, "status", "Availability", line, errors, false).toUpperCase() || "PENDING";
    if (!["LEAVE", "COMP_OFF", "UNAVAILABLE"].includes(typeValue)) errors.push(`Availability row ${line}: type must be LEAVE, COMP_OFF, or UNAVAILABLE.`);
    if (!["PENDING", "APPROVED", "REJECTED"].includes(statusValue)) errors.push(`Availability row ${line}: status must be PENDING, APPROVED, or REJECTED.`);
    const startDate = dateValue(field(row, "startDate", "Availability", line, errors), "Availability", line, "startDate", errors) ?? "1970-01-01";
    const endDate = dateValue(field(row, "endDate", "Availability", line, errors), "Availability", line, "endDate", errors) ?? "1970-01-01";
    if (endDate < startDate) errors.push(`Availability row ${line}: endDate must not be before startDate.`);
    return { employeeKey: field(row, "employeeKey", "Availability", line, errors), type: ["LEAVE", "COMP_OFF", "UNAVAILABLE"].includes(typeValue) ? typeValue as ImportData["availability"][number]["type"] : "LEAVE", status: ["PENDING", "APPROVED", "REJECTED"].includes(statusValue) ? statusValue as ImportData["availability"][number]["status"] : "PENDING", startDate, endDate, note: field(row, "note", "Availability", line, errors, false) || null };
  });
  const holidayRows = sheetRows(workbook.getWorksheet("Holidays"), errors);
  data.holidays = holidayRows.map(({ line, row }) => ({
    date: dateValue(field(row, "date", "Holidays", line, errors), "Holidays", line, "date", errors) ?? "1970-01-01",
    name: field(row, "name", "Holidays", line, errors), region: field(row, "region", "Holidays", line, errors, false) || "GLOBAL",
  }));

  assertUnique(data.pods.map((item) => item.externalKey), "Pods", errors);
  assertUnique(data.employees.map((item) => item.externalKey), "Employees", errors);
  assertUnique(data.brands.map((item) => item.externalKey), "Brands", errors);
  assertUnique(data.processes.map((item) => item.externalKey), "Processes", errors);
  validateReferences(data, errors, existing);

  const rowCount = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  const counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
  return { data, errors, rowCount, counts };
}

export function createImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rosterly";
  workbook.subject = "Anonymized roster source data template";
  workbook.properties.date1904 = false;
  const sheets: Record<string, string[]> = {
    ReadMe: ["Sheet", "Required columns", "Notes"],
    Pods: ["externalKey", "name", "leadEmployeeKey"],
    Employees: ["externalKey", "name", "podKey", "weeklyOffDays", "mandatoryOffDays", "maxDailyMinutes", "active"],
    Brands: ["externalKey", "name", "podKey"],
    Processes: ["externalKey", "brandKey", "name", "operatingDays", "holidayMode", "minStaff", "startTime", "endTime"],
    ProcessRules: ["processKey", "weekday", "isOpen", "minStaff"],
    Eligibility: ["employeeKey", "processKey", "validFrom", "validUntil", "isBackup"],
    Availability: ["employeeKey", "type", "startDate", "endDate", "status", "note"],
    Holidays: ["date", "name", "region"],
  };
  const notes = [
    ["ReadMe", "Sheet names and headers are case-insensitive. Keep identifiers stable between sheets.", "No example names or real employee data are included."],
    ["Pods", "externalKey, name", "leadEmployeeKey is optional and points to Employees.externalKey."],
    ["Employees", "externalKey, name, podKey", "Days accept Mon,Wed or ISO weekdays 1–7 (Mon=1, Sun=7)."],
    ["Brands", "externalKey, name", "podKey may be blank for shared brands."],
    ["Processes", "externalKey, brandKey, name", "Times use 24-hour HH:MM. operatingDays accepts weekday names or 1–7."],
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
