export type PlannerEmployee = {
  id: string;
  name: string;
  podId: string;
  active: boolean;
  weeklyOffDays: number[];
  mandatoryOffDays: number[];
  maxDailyMinutes: number;
};

export type PlannerProcess = {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  operatingDays: number[];
  holidayMode: "OPEN" | "CLOSED";
  minStaff: number;
  startMinute: number;
  endMinute: number;
  weekdayRules: Array<{ weekday: number; isOpen: boolean; minStaff: number }>;
};

export type PlannerEligibility = {
  employeeId: string;
  processId: string;
  validFrom: string;
  validUntil: string | null;
  isBackup: boolean;
};

export type PlannerAbsence = {
  employeeId: string;
  startDate: string;
  endDate: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  type: "LEAVE" | "COMP_OFF" | "UNAVAILABLE";
};

export type PlannerHoliday = { date: string; name: string; region: string };

export type PlannedAssignment = {
  date: string;
  employeeId: string;
  processId: string;
  brandId: string;
  source: "GENERATED" | "MANUAL";
};

export type ScheduleIssue = {
  date: string;
  processId: string;
  severity: "ERROR" | "WARNING";
  code:
    | "COVERAGE_GAP"
    | "WEEKLY_OFF_OVERRIDE"
    | "INELIGIBLE"
    | "APPROVED_ABSENCE"
    | "MANDATORY_OFF"
    | "OVERLAP"
    | "DAILY_CAPACITY"
    | "NON_OPERATING_DAY";
  message: string;
  missing: number;
};

export type PlannerInput = {
  month: string; // YYYY-MM
  employees: PlannerEmployee[];
  processes: PlannerProcess[];
  eligibility: PlannerEligibility[];
  absences: PlannerAbsence[];
  holidays: PlannerHoliday[];
  holidayRegion: string;
};

export type PlannerOutput = {
  assignments: PlannedAssignment[];
  issues: ScheduleIssue[];
  totals: { requiredSlots: number; filledSlots: number; gapSlots: number };
};

type DayAssignment = PlannedAssignment & { startMinute: number; endMinute: number; backup: boolean };

const dateString = (date: Date) => date.toISOString().slice(0, 10);
const weekdayISO = (date: Date) => ((date.getUTCDay() + 6) % 7) + 1;

function monthDates(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Month must use YYYY-MM format.");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error("Month is outside the calendar year.");
  const result: Date[] = [];
  const cursor = new Date(Date.UTC(year, monthIndex, 1));
  while (cursor.getUTCMonth() === monthIndex) {
    result.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function isBetween(value: string, start: string, end: string | null) {
  return value >= start && (end === null || value <= end);
}

function elapsedMinutes(date: string, assignments: DayAssignment[]) {
  return assignments
    .filter((assignment) => assignment.date === date)
    .reduce((sum, assignment) => sum + assignment.endMinute - assignment.startMinute, 0);
}

export function buildMonthlyRoster(input: PlannerInput): PlannerOutput {
  const dates = monthDates(input.month);
  const employees = input.employees.filter((employee) => employee.active);
  const processes = input.processes.filter((process) => process.startMinute < process.endMinute);
  const eligibility = new Map<string, PlannerEligibility[]>();

  for (const allocation of input.eligibility) {
    const key = `${allocation.processId}\u0000${allocation.employeeId}`;
    const list = eligibility.get(key) ?? [];
    list.push(allocation);
    eligibility.set(key, list);
  }

  const holidayByDate = new Map<string, PlannerHoliday>();
  for (const holiday of input.holidays) {
    if (holiday.region === input.holidayRegion || holiday.region === "GLOBAL") {
      holidayByDate.set(holiday.date, holiday);
    }
  }

  const absenceByEmployee = new Map<string, PlannerAbsence[]>();
  for (const absence of input.absences) {
    if (absence.status !== "APPROVED") continue;
    const list = absenceByEmployee.get(absence.employeeId) ?? [];
    list.push(absence);
    absenceByEmployee.set(absence.employeeId, list);
  }

  const assignments: DayAssignment[] = [];
  const issues: ScheduleIssue[] = [];
  const workload = new Map(employees.map((employee) => [employee.id, 0]));
  let requiredSlots = 0;
  let filledSlots = 0;

  for (const dateObject of dates) {
    const date = dateString(dateObject);
    const weekday = weekdayISO(dateObject);
    const holiday = holidayByDate.has(date);
    const dailyJobs = processes.flatMap((process) => {
      const rule = process.weekdayRules.find((item) => item.weekday === weekday);
      const isOpen = rule?.isOpen ?? process.operatingDays.includes(weekday);
      if (!isOpen || (holiday && process.holidayMode === "CLOSED")) return [];
      const required = rule?.minStaff ?? process.minStaff;
      if (required < 1) return [];

      const potential = employees.filter((employee) => {
        const allocations = eligibility.get(`${process.id}\u0000${employee.id}`) ?? [];
        return allocations.some((item) => isBetween(date, item.validFrom, item.validUntil));
      });
      return [{ process, required, potentialCount: potential.length }];
    }).sort((left, right) => left.potentialCount - right.potentialCount || left.process.id.localeCompare(right.process.id));

    for (const job of dailyJobs) {
      requiredSlots += job.required;
      let filled = 0;
      const scheduledForProcess = new Set<string>();

      for (let slot = 0; slot < job.required; slot += 1) {
        const candidates = employees.flatMap((employee) => {
          if (scheduledForProcess.has(employee.id)) return [];
          const allocations = eligibility.get(`${job.process.id}\u0000${employee.id}`) ?? [];
          const activeAllocation = allocations.find((item) => isBetween(date, item.validFrom, item.validUntil));
          if (!activeAllocation) return [];

          const absences = absenceByEmployee.get(employee.id) ?? [];
          if (absences.some((absence) => isBetween(date, absence.startDate, absence.endDate))) return [];
          if (employee.mandatoryOffDays.includes(weekday)) return [];

          const existingToday = assignments.filter((item) => item.employeeId === employee.id && item.date === date);
          const overlap = existingToday.some((item) =>
            job.process.startMinute < item.endMinute && item.startMinute < job.process.endMinute,
          );
          if (overlap) return [];

          const totalMinutes = elapsedMinutes(date, existingToday);
          const duration = job.process.endMinute - job.process.startMinute;
          if (totalMinutes + duration > employee.maxDailyMinutes) return [];

          const weeklyOffOverride = employee.weeklyOffDays.includes(weekday);
          const score =
            (workload.get(employee.id) ?? 0) * 10 +
            (activeAllocation.isBackup ? 8 : 0) +
            (weeklyOffOverride ? 10_000 : 0) +
            (existingToday.length > 0 ? 3 : 0);
          return [{ employee, backup: activeAllocation.isBackup, weeklyOffOverride, score }];
        }).sort((left, right) => left.score - right.score || left.employee.id.localeCompare(right.employee.id));

        const chosen = candidates[0];
        if (!chosen) break;

        assignments.push({
          date,
          employeeId: chosen.employee.id,
          processId: job.process.id,
          brandId: job.process.brandId,
          source: "GENERATED",
          startMinute: job.process.startMinute,
          endMinute: job.process.endMinute,
          backup: chosen.backup,
        });
        scheduledForProcess.add(chosen.employee.id);
        workload.set(chosen.employee.id, (workload.get(chosen.employee.id) ?? 0) + 1);
        filled += 1;
        if (chosen.weeklyOffOverride) {
          issues.push({
            date,
            processId: job.process.id,
            severity: "WARNING",
            code: "WEEKLY_OFF_OVERRIDE",
            message: `${chosen.employee.name} is scheduled on a preferred weekly off to maintain required coverage.`,
            missing: 0,
          });
        }
      }

      filledSlots += filled;
      if (filled < job.required) {
        issues.push({
          date,
          processId: job.process.id,
          severity: "ERROR",
          code: "COVERAGE_GAP",
          message: `${job.process.brandName} / ${job.process.name} needs ${job.required} people but has ${filled} eligible assignment${filled === 1 ? "" : "s"}.`,
          missing: job.required - filled,
        });
      }
    }
  }

  return {
    assignments: assignments.map((assignment) => ({
      date: assignment.date,
      employeeId: assignment.employeeId,
      processId: assignment.processId,
      brandId: assignment.brandId,
      source: assignment.source,
    })),
    issues,
    totals: { requiredSlots, filledSlots, gapSlots: requiredSlots - filledSlots },
  };
}

export function validateMonthlyRoster(
  input: PlannerInput,
  assignments: PlannedAssignment[],
): ScheduleIssue[] {
  const dates = monthDates(input.month);
  const employees = new Map(input.employees.map((employee) => [employee.id, employee]));
  const processes = new Map(input.processes.map((process) => [process.id, process]));
  const issues: ScheduleIssue[] = [];
  const issueKeys = new Set<string>();

  const addIssue = (issue: ScheduleIssue) => {
    const key = `${issue.date}|${issue.processId}|${issue.code}|${issue.message}`;
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(issue);
    }
  };

  const assignmentsByDayProcess = new Map<string, PlannedAssignment[]>();
  const assignmentsByDayEmployee = new Map<string, PlannedAssignment[]>();

  for (const assignment of assignments) {
    const process = processes.get(assignment.processId);
    const employee = employees.get(assignment.employeeId);
    const dateObject = new Date(`${assignment.date}T00:00:00.000Z`);
    const dateInMonth = dateObject.getUTCMonth() + 1 === Number(input.month.slice(5, 7)) &&
      dateObject.getUTCFullYear() === Number(input.month.slice(0, 4));

    if (!dateInMonth) {
      addIssue({ date: assignment.date, processId: assignment.processId, severity: "ERROR", code: "NON_OPERATING_DAY", message: "Assignment date is outside the selected month.", missing: 0 });
      continue;
    }
    if (!process) {
      addIssue({ date: assignment.date, processId: assignment.processId, severity: "ERROR", code: "NON_OPERATING_DAY", message: "Assignment points to an inactive or unavailable process.", missing: 0 });
      continue;
    }
    if (!employee) {
      addIssue({ date: assignment.date, processId: assignment.processId, severity: "ERROR", code: "INELIGIBLE", message: "Assignment points to an inactive or out-of-scope employee.", missing: 0 });
      continue;
    }

    const dayProcessKey = `${assignment.date}|${assignment.processId}`;
    const byProcess = assignmentsByDayProcess.get(dayProcessKey) ?? [];
    byProcess.push(assignment);
    assignmentsByDayProcess.set(dayProcessKey, byProcess);

    const dayEmployeeKey = `${assignment.date}|${assignment.employeeId}`;
    const byEmployee = assignmentsByDayEmployee.get(dayEmployeeKey) ?? [];
    byEmployee.push(assignment);
    assignmentsByDayEmployee.set(dayEmployeeKey, byEmployee);

    const weekday = weekdayISO(dateObject);
    const holiday = input.holidays.some((item) => item.date === assignment.date &&
      (item.region === input.holidayRegion || item.region === "GLOBAL"));
    const rule = process.weekdayRules.find((item) => item.weekday === weekday);
    const open = (rule?.isOpen ?? process.operatingDays.includes(weekday)) &&
      !(holiday && process.holidayMode === "CLOSED");
    if (!open) {
      addIssue({ date: assignment.date, processId: process.id, severity: "ERROR", code: "NON_OPERATING_DAY", message: `${process.brandName} / ${process.name} is closed on this date.`, missing: 0 });
    }

    const eligible = input.eligibility.some((item) =>
      item.employeeId === employee.id && item.processId === process.id && isBetween(assignment.date, item.validFrom, item.validUntil),
    );
    if (!eligible) {
      addIssue({ date: assignment.date, processId: process.id, severity: "ERROR", code: "INELIGIBLE", message: `${employee.name} is not eligible for ${process.brandName} / ${process.name} on this date.`, missing: 0 });
    }

    const absent = input.absences.some((absence) =>
      absence.employeeId === employee.id && absence.status === "APPROVED" && isBetween(assignment.date, absence.startDate, absence.endDate),
    );
    if (absent) {
      addIssue({ date: assignment.date, processId: process.id, severity: "ERROR", code: "APPROVED_ABSENCE", message: `${employee.name} has approved time off on this date.`, missing: 0 });
    }

    if (employee.mandatoryOffDays.includes(weekday)) {
      addIssue({ date: assignment.date, processId: process.id, severity: "ERROR", code: "MANDATORY_OFF", message: `${employee.name} has a mandatory weekly off on this date.`, missing: 0 });
    } else if (employee.weeklyOffDays.includes(weekday)) {
      addIssue({ date: assignment.date, processId: process.id, severity: "WARNING", code: "WEEKLY_OFF_OVERRIDE", message: `${employee.name} is scheduled on a preferred weekly off to maintain required coverage.`, missing: 0 });
    }
  }

  for (const dateObject of dates) {
    const date = dateString(dateObject);
    const weekday = weekdayISO(dateObject);
    const holiday = input.holidays.some((item) => item.date === date &&
      (item.region === input.holidayRegion || item.region === "GLOBAL"));

    for (const process of input.processes) {
      const rule = process.weekdayRules.find((item) => item.weekday === weekday);
      const open = (rule?.isOpen ?? process.operatingDays.includes(weekday)) &&
        !(holiday && process.holidayMode === "CLOSED");
      if (!open) continue;
      const required = rule?.minStaff ?? process.minStaff;
      if (required < 1) continue;
      const count = (assignmentsByDayProcess.get(`${date}|${process.id}`) ?? []).length;
      if (count < required) {
        addIssue({
          date,
          processId: process.id,
          severity: "ERROR",
          code: "COVERAGE_GAP",
          message: `${process.brandName} / ${process.name} needs ${required} people but has ${count}.`,
          missing: required - count,
        });
      }
    }
  }

  for (const [key, dayAssignments] of assignmentsByDayEmployee) {
    if (dayAssignments.length < 2) continue;
    const date = key.slice(0, 10);
    const employeeId = key.slice(11);
    const employee = employees.get(employeeId);
    if (!employee) continue;
    const withTimes = dayAssignments.flatMap((assignment) => {
      const process = processes.get(assignment.processId);
      return process ? [{ assignment, process }] : [];
    }).sort((left, right) => left.process.startMinute - right.process.startMinute);

    let previous = withTimes[0];
    for (let index = 1; index < withTimes.length; index += 1) {
      const current = withTimes[index];
      if (current.process.startMinute < previous.process.endMinute) {
        addIssue({
          date,
          processId: current.process.id,
          severity: "ERROR",
          code: "OVERLAP",
          message: `${employee.name} has overlapping assignments for ${previous.process.brandName} / ${previous.process.name} and ${current.process.brandName} / ${current.process.name}.`,
          missing: 0,
        });
      }
      if (current.process.endMinute > previous.process.endMinute) previous = current;
    }

    const totalMinutes = withTimes.reduce((sum, item) => sum + item.process.endMinute - item.process.startMinute, 0);
    if (totalMinutes > employee.maxDailyMinutes) {
      const process = withTimes.at(-1)?.process;
      if (process) {
        addIssue({
          date,
          processId: process.id,
          severity: "ERROR",
          code: "DAILY_CAPACITY",
          message: `${employee.name} is scheduled for ${totalMinutes} minutes against a ${employee.maxDailyMinutes}-minute daily limit.`,
          missing: 0,
        });
      }
    }
  }

  return issues;
}

export function measureCoverage(input: PlannerInput, assignments: PlannedAssignment[]) {
  let requiredSlots = 0;
  let filledSlots = 0;
  const dates = monthDates(input.month);

  for (const dateObject of dates) {
    const date = dateString(dateObject);
    const weekday = weekdayISO(dateObject);
    const holiday = input.holidays.some((item) => item.date === date &&
      (item.region === input.holidayRegion || item.region === "GLOBAL"));

    for (const process of input.processes) {
      const rule = process.weekdayRules.find((item) => item.weekday === weekday);
      const open = (rule?.isOpen ?? process.operatingDays.includes(weekday)) &&
        !(holiday && process.holidayMode === "CLOSED");
      const required = rule?.minStaff ?? process.minStaff;
      if (!open || required < 1) continue;
      requiredSlots += required;
      const assigned = new Set(assignments
        .filter((assignment) => assignment.date === date && assignment.processId === process.id)
        .map((assignment) => assignment.employeeId));
      filledSlots += Math.min(required, assigned.size);
    }
  }

  return {
    requiredSlots,
    filledSlots,
    gapSlots: requiredSlots - filledSlots,
    coveragePercent: requiredSlots === 0 ? 100 : Math.round((filledSlots / requiredSlots) * 100),
  };
}
