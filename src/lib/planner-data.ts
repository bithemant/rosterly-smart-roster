import "server-only";
import { db } from "@/lib/db";
import { employeeFilter, podScope, ALL_ROLES } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import type { PlannerInput } from "@/lib/scheduling/engine";

const isoDate = (date: Date | null) => date ? date.toISOString().slice(0, 10) : null;

export async function loadRosterContext(user: SessionUser, month: string, includeAllScopes = false) {
  const employeeWhere = includeAllScopes ? {} : employeeFilter(user);
  const employees = await db.employee.findMany({
    where: { ...employeeWhere, active: true },
    include: { pod: { select: { id: true, name: true } } },
    orderBy: [{ pod: { name: "asc" } }, { displayName: "asc" }],
  });
  const employeeIds = employees.map((employee) => employee.id);

  const processWhere = includeAllScopes
    ? { active: true, brand: { active: true } }
    : ALL_ROLES.includes(user.role)
      ? { active: true, brand: { active: true } }
      : user.role === "POD_LEAD"
        ? { active: true, brand: { active: true, podId: user.managedPodId } }
        : { active: true, brand: { active: true }, eligibility: { some: { employeeId: user.employeeId ?? "" } } };

  const processes = await db.process.findMany({
    where: processWhere,
    include: { brand: { select: { id: true, name: true, podId: true } }, weekdayRules: true },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });
  const processIds = processes.map((process) => process.id);

  const [eligibility, absences, holidays, pods] = await Promise.all([
    employeeIds.length && processIds.length
      ? db.employeeEligibility.findMany({
          where: { employeeId: { in: employeeIds }, processId: { in: processIds } },
        })
      : Promise.resolve([]),
    employeeIds.length
      ? db.employeeAvailability.findMany({
          where: { employeeId: { in: employeeIds }, status: { in: ["PENDING", "APPROVED"] } },
        })
      : Promise.resolve([]),
    db.publicHoliday.findMany({ orderBy: { date: "asc" } }),
    db.pod.findMany({ where: includeAllScopes ? {} : podScope(user), orderBy: { name: "asc" } }),
  ]);

  const holidayRegion = process.env.APP_HOLIDAY_REGION ?? "GLOBAL";
  const plannerInput: PlannerInput = {
    month,
    holidayRegion,
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employee.displayName,
      podId: employee.podId,
      active: employee.active,
      weeklyOffDays: employee.weeklyOffDays,
      mandatoryOffDays: employee.mandatoryOffDays,
      maxDailyMinutes: employee.maxDailyMinutes,
    })),
    processes: processes.map((process) => ({
      id: process.id,
      name: process.name,
      brandId: process.brandId,
      brandName: process.brand.name,
      operatingDays: process.operatingDays,
      holidayMode: process.holidayMode,
      minStaff: process.minStaff,
      startMinute: process.startMinute,
      endMinute: process.endMinute,
      weekdayRules: process.weekdayRules.map((rule) => ({
        weekday: rule.weekday,
        isOpen: rule.isOpen,
        minStaff: rule.minStaff,
      })),
    })),
    eligibility: eligibility.map((item) => ({
      employeeId: item.employeeId,
      processId: item.processId,
      validFrom: isoDate(item.validFrom) ?? "1970-01-01",
      validUntil: isoDate(item.validUntil),
      isBackup: item.isBackup,
    })),
    absences: absences.map((item) => ({
      employeeId: item.employeeId,
      startDate: isoDate(item.startDate) ?? "1970-01-01",
      endDate: isoDate(item.endDate) ?? "1970-01-01",
      status: item.status,
      type: item.type,
    })),
    holidays: holidays.map((item) => ({
      date: isoDate(item.date) ?? "1970-01-01",
      name: item.name,
      region: item.region,
    })),
  };

  return { plannerInput, employees, processes, pods };
}
