import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { loadRosterContext } from "@/lib/planner-data";
import { measureCoverage, validateMonthlyRoster, type PlannedAssignment } from "@/lib/scheduling/engine";

export const dynamic = "force-dynamic";

function normalizeMonth(value: string | null) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const month = normalizeMonth(new URL(request.url).searchParams.get("month"));
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    const context = await loadRosterContext(user, month);
    const { plannerInput, employees, processes, pods } = context;
    const brandIds = [...new Set(processes.map((process) => process.brandId))];
    const employeeIds = employees.map((employee) => employee.id);

    const roster = await db.roster.findUnique({
      where: { month: monthDate },
      select: { id: true, month: true },
    });
    const version = roster
      ? await db.rosterVersion.findFirst({
          where: {
            rosterId: roster.id,
            ...(user.role === "EMPLOYEE" ? { status: "PUBLISHED" as const } : {}),
          },
          orderBy: { number: "desc" },
          include: {
            assignments: {
              where: {
                processId: { in: processes.map((process) => process.id) },
                employeeId: { in: employeeIds },
              },
              include: { employee: { select: { id: true, displayName: true, podId: true } }, process: { include: { brand: { select: { id: true, name: true, podId: true } } } } },
              orderBy: [{ date: "asc" }, { employee: { displayName: "asc" } }],
            },
          },
        })
      : null;

    const assignments: PlannedAssignment[] = version?.assignments.map((item) => ({
      date: dateOnly(item.date),
      employeeId: item.employeeId,
      processId: item.processId,
      brandId: item.process.brandId,
      source: item.source,
    })) ?? [];

    const coverage = version ? measureCoverage(plannerInput, assignments) : null;
    const validation = version ? validateMonthlyRoster(plannerInput, assignments) : [];
    const processById = new Map(processes.map((process) => [process.id, process]));
    const issueDetails = validation.map((issue) => {
      const process = processById.get(issue.processId);
      return {
        ...issue,
        processName: process?.name ?? "Unknown process",
        brandName: process?.brand.name ?? "Unassigned brand",
        brandId: process?.brandId ?? "",
      };
    });

    const podSummary = pods.map((pod) => {
      const podEmployees = plannerInput.employees.filter((employee) => employee.podId === pod.id);
      const podProcesses = plannerInput.processes.filter((process) =>
        processes.find((row) => row.id === process.id)?.brand.podId === pod.id,
      );
      const podEmployeeIds = new Set(podEmployees.map((employee) => employee.id));
      const podProcessIds = new Set(podProcesses.map((process) => process.id));
      const podInput = {
        ...plannerInput,
        employees: podEmployees,
        processes: podProcesses,
        eligibility: plannerInput.eligibility.filter((row) => podEmployeeIds.has(row.employeeId) && podProcessIds.has(row.processId)),
        absences: plannerInput.absences.filter((row) => podEmployeeIds.has(row.employeeId)),
      };
      const podAssignments = assignments.filter((assignment) => podProcessIds.has(assignment.processId));
      const metrics = version ? measureCoverage(podInput, podAssignments) : null;
      return {
        id: pod.id,
        name: pod.name,
        leadName: podEmployees.find((employee) => employee.id === pod.leadEmployeeId)?.name ?? null,
        employeeCount: podEmployees.length,
        coverage: metrics?.coveragePercent ?? null,
        gapSlots: metrics?.gapSlots ?? null,
      };
    });

    const availability = await db.employeeAvailability.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: { in: user.role === "EMPLOYEE" ? ["PENDING", "APPROVED"] : ["PENDING", "APPROVED"] },
        startDate: { lte: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)) },
        endDate: { gte: monthDate },
      },
      include: { employee: { select: { id: true, displayName: true, podId: true } } },
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
    });

    return Response.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        managedPodId: user.managedPodId,
      },
      month,
      counts: {
        employees: employees.length,
        brands: brandIds.length,
        processes: processes.length,
      },
      coverage,
      version: version ? { id: version.id, number: version.number, status: version.status, createdAt: version.createdAt.toISOString(), publishedAt: version.publishedAt?.toISOString() ?? null } : null,
      employees: employees.map((employee) => ({ id: employee.id, name: employee.displayName, podId: employee.podId, podName: employee.pod.name })),
      pods: pods.map((pod) => ({ id: pod.id, name: pod.name, leadEmployeeId: pod.leadEmployeeId })),
      brands: [...new Map(processes.map((process) => [process.brand.id, { id: process.brand.id, name: process.brand.name, podId: process.brand.podId }])).values()],
      processes: processes.map((process) => ({ id: process.id, name: process.name, brandId: process.brandId, brandName: process.brand.name, podId: process.brand.podId, minStaff: process.minStaff })),
      assignments: version?.assignments.map((item) => ({
        id: item.id,
        date: dateOnly(item.date),
        employeeId: item.employeeId,
        employeeName: item.employee.displayName,
        podId: item.employee.podId,
        processId: item.processId,
        processName: item.process.name,
        brandId: item.process.brand.id,
        brandName: item.process.brand.name,
        source: item.source,
      })) ?? [],
      issues: issueDetails,
      podSummary,
      availability: availability.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: item.employee.displayName,
        podId: item.employee.podId,
        type: item.type,
        status: item.status,
        startDate: dateOnly(item.startDate),
        endDate: dateOnly(item.endDate),
        note: item.note,
      })),
      aiReady: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    });
  } catch (error) {
    return jsonError(error);
  }
}
