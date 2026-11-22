import { resolve } from "node:path";
import { createImportTemplate } from "../src/lib/import-template";

const outputPath = resolve(process.argv[2] ?? "docs/demo-workforce-workbook.xlsx");
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const allDays = weekdays.join(",");
const weekdaysOnly = weekdays.slice(0, 5).join(",");
const sixDays = weekdays.slice(0, 6).join(",");
const podDefinitions = [
  { key: "DEMO-POD-NORTH", name: "Demo Pod North", firstEmployee: 1 },
  { key: "DEMO-POD-SOUTH", name: "Demo Pod South", firstEmployee: 7 },
  { key: "DEMO-POD-EAST", name: "Demo Pod East", firstEmployee: 13 },
  { key: "DEMO-POD-WEST", name: "Demo Pod West", firstEmployee: 19 },
  { key: "DEMO-POD-CORE", name: "Demo Pod Core", firstEmployee: 25 },
];
const employeeKey = (number: number) => `DEMO-EMP-${String(number).padStart(3, "0")}`;
const brandKey = (number: number) => `DEMO-BRAND-${String(number).padStart(2, "0")}`;
const processKey = (brand: number, code: string) => `${brandKey(brand)}-${code}`;

function addRows(workbook: ReturnType<typeof createImportTemplate>, sheetName: string, rows: Array<Array<string | number | boolean>>) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`The template is missing its ${sheetName} sheet.`);
  rows.forEach((row) => sheet.addRow(row));
}

async function main() {
  const workbook = createImportTemplate();
  const readMe = workbook.getWorksheet("ReadMe");
  readMe?.addRow(["Dataset notice", "Synthetic assessment demo only", "Generated operator IDs and fictional brand names; never use as real workforce records."]);

  addRows(workbook, "Pods", podDefinitions.map((pod) => [pod.key, pod.name, employeeKey(pod.firstEmployee)]));

  const employees: Array<Array<string | number | boolean>> = [];
  const brands: Array<Array<string | number | boolean>> = [];
  const processes: Array<Array<string | number | boolean>> = [];
  const eligibility: Array<Array<string | number | boolean>> = [];

  for (let number = 1; number <= 24; number += 1) {
    const pod = podDefinitions[Math.floor((number - 1) / 6)];
    const brand = number;
    const group = Math.floor((number - 1) / 6);
    const weeklyOffDays = group === 1 || group === 3 ? "Sun" : "Sat,Sun";
    const operatingDays = group === 0 || group === 2 ? weekdaysOnly : sixDays;
    const holidayMode = group >= 2 ? "OPEN" : "CLOSED";
    const secondaryProcess = group === 0 ? "ACC" : group === 1 ? "NDR" : group === 2 ? "RET" : "NDR";

    employees.push([employeeKey(number), `Demo Operator ${String(number).padStart(3, "0")}`, pod.key, weeklyOffDays, "", 480, true]);
    brands.push([brandKey(brand), `Demo Brand ${String(brand).padStart(2, "0")}`, pod.key, true]);
    const brandProcesses = [
      [processKey(brand, "CS"), brandKey(brand), "Customer Support", operatingDays, holidayMode, 1, "09:00", "13:00", true],
      [processKey(brand, secondaryProcess), brandKey(brand), secondaryProcess === "ACC" ? "Abandoned Cart Conversions" : secondaryProcess === "RET" ? "Retention" : "Non-Delivery Reports", operatingDays, holidayMode, 1, "13:00", "17:00", true],
    ];
    processes.push(...brandProcesses);
    for (const row of brandProcesses) eligibility.push([employeeKey(number), row[0] as string, "2026-01-01", "", false]);
    if (brand === 1) {
      brandProcesses.forEach((row) => eligibility.push([employeeKey(25), row[0] as string, "2026-01-01", "", true]));
    }
  }

  const corePod = podDefinitions[4];
  for (let number = 25; number <= 30; number += 1) {
    const offDay = weekdays[number - 25];
    employees.push([employeeKey(number), `Demo Operator ${String(number).padStart(3, "0")}`, corePod.key, offDay, "", 480, true]);
    brands.push([brandKey(number), `Demo Brand ${String(number).padStart(2, "0")}`, corePod.key, true]);
  }

  const sharedTeams: Record<number, number[]> = {
    25: [25, 26, 27],
    26: [26, 27, 28],
    27: [27, 28, 29],
    28: [28, 29, 30],
    29: [29, 30, 25],
    30: [30, 25, 26],
  };
  const sharedProcesses = [
    { brand: 25, code: "CS", name: "Always-On Customer Support", days: allDays, holiday: "OPEN", min: 1, start: "08:00", end: "12:00" },
    { brand: 26, code: "ACC", name: "Conversion Support", days: allDays, holiday: "OPEN", min: 1, start: "13:00", end: "17:00" },
    { brand: 27, code: "NDR", name: "Delivery Exceptions", days: sixDays, holiday: "CLOSED", min: 1, start: "08:00", end: "12:00" },
    { brand: 28, code: "CS", name: "Customer Support", days: allDays, holiday: "OPEN", min: 1, start: "13:00", end: "17:00" },
    { brand: 29, code: "RET", name: "Retention", days: weekdaysOnly, holiday: "CLOSED", min: 1, start: "08:00", end: "12:00" },
    { brand: 30, code: "NDR", name: "Returns and Delivery Support", days: allDays, holiday: "OPEN", min: 1, start: "13:00", end: "17:00" },
  ];
  for (const item of sharedProcesses) {
    const key = processKey(item.brand, item.code);
    processes.push([key, brandKey(item.brand), item.name, item.days, item.holiday, item.min, item.start, item.end, true]);
    sharedTeams[item.brand].forEach((number, index) => eligibility.push([employeeKey(number), key, "2026-01-01", "", index > 0]));
  }

  addRows(workbook, "Employees", employees);
  addRows(workbook, "Brands", brands);
  addRows(workbook, "Processes", processes);
  addRows(workbook, "Eligibility", eligibility);
  addRows(workbook, "ProcessRules", [
    [processKey(25, "CS"), 6, true, 2],
    [processKey(25, "CS"), 7, true, 2],
  ]);
  addRows(workbook, "Availability", [
    [employeeKey(26), "LEAVE", "2026-12-15", "2026-12-15", "APPROVED", "Synthetic demo leave for coverage review."],
  ]);
  addRows(workbook, "Holidays", [
    ["2026-12-25", "Demo Winter Holiday", "GLOBAL"],
    ["2026-12-26", "Demo Regional Holiday", "GLOBAL"],
  ]);

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Created clearly labeled synthetic demo workbook at ${outputPath}`);
  console.log("Dataset: 30 operators, 30 fictional brands, 5 pods, 54 processes, and 68 eligibility allocations for December 2026.");
}

main().catch((error: unknown) => {
  console.error("Could not create the synthetic demo roster workbook.", error);
  process.exitCode = 1;
});
