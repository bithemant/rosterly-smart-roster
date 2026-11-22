import { z } from "zod";
import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { loadRosterContext } from "@/lib/planner-data";
import { assertPodAccess, ALL_ROLES } from "@/lib/permissions";
import { validateMonthlyRoster, type PlannedAssignment } from "@/lib/scheduling/engine";

const schema = z.object({
  action: z.enum(["assign", "unassign"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().min(1),
  processId: z.string().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD"]);
    const { versionId } = await context.params;
    const input = schema.parse(await request.json());
    const version = await db.rosterVersion.findUnique({ where: { id: versionId }, include: { roster: true } });
    if (!version || version.status !== "DRAFT") throw new HttpError(409, "Manual changes are available on draft roster versions only.");
    const [process, employee] = await Promise.all([
      db.process.findUnique({ where: { id: input.processId }, include: { brand: true } }),
      db.employee.findUnique({ where: { id: input.employeeId } }),
    ]);
    if (!process || !employee || !process.active || !process.brand.active || !employee.active) throw new HttpError(404, "The selected employee or process is not active.");
    assertPodAccess(user, process.brand.podId);
    if (!ALL_ROLES.includes(user.role) && user.role === "POD_LEAD" && employee.podId !== user.managedPodId) throw new HttpError(403, "You can only change assignments in your pod.");
    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (date.getUTCFullYear() !== version.roster.month.getUTCFullYear() || date.getUTCMonth() !== version.roster.month.getUTCMonth()) throw new HttpError(400, "The assignment date must be within the roster month.");

    await db.$transaction(async (tx) => {
      const claimed = await tx.rosterVersion.updateMany({
        where: { id: versionId, status: "DRAFT", revision: version.revision },
        data: { revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new HttpError(409, "This draft changed in another session. Refresh before editing again.");

      if (input.action === "assign") {
        const eligibility = await tx.employeeEligibility.findFirst({ where: { employeeId: employee.id, processId: process.id, validFrom: { lte: date }, OR: [{ validUntil: null }, { validUntil: { gte: date } }] } });
        if (!eligibility) throw new HttpError(409, "This employee is not eligible for the selected process on that date.");
        const absence = await tx.employeeAvailability.findFirst({ where: { employeeId: employee.id, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } } });
        if (absence) throw new HttpError(409, "This employee has approved time off on that date.");
        const weekday = ((date.getUTCDay() + 6) % 7) + 1;
        if (employee.mandatoryOffDays.includes(weekday)) throw new HttpError(409, "This employee has a mandatory weekly off on that date.");
        const existing = await tx.rosterAssignment.findMany({ where: { versionId, employeeId: employee.id, date }, include: { process: true } });
        if (existing.some((row) => process.startMinute < row.process.endMinute && row.process.startMinute < process.endMinute)) throw new HttpError(409, "This assignment overlaps another shift for the employee.");
        const minutes = existing.reduce((total, row) => total + row.process.endMinute - row.process.startMinute, 0) + process.endMinute - process.startMinute;
        if (minutes > employee.maxDailyMinutes) throw new HttpError(409, "This assignment exceeds the employee’s daily capacity.");
        await tx.rosterAssignment.upsert({
          where: { versionId_employeeId_processId_date: { versionId, employeeId: employee.id, processId: process.id, date } },
          create: { versionId, employeeId: employee.id, processId: process.id, date, source: "MANUAL" },
          update: { source: "MANUAL" },
        });
      } else {
        await tx.rosterAssignment.deleteMany({ where: { versionId, employeeId: employee.id, processId: process.id, date } });
      }

      const assignments = await tx.rosterAssignment.findMany({ where: { versionId } });
      const { plannerInput } = await loadRosterContext(user, version.roster.month.toISOString().slice(0, 7), true);
      const planned: PlannedAssignment[] = assignments.map((item) => ({ date: item.date.toISOString().slice(0, 10), employeeId: item.employeeId, processId: item.processId, brandId: "", source: "GENERATED" }));
      const issues = validateMonthlyRoster(plannerInput, planned);
      await tx.rosterIssue.deleteMany({ where: { versionId } });
      if (issues.length) await tx.rosterIssue.createMany({ data: issues.map((item) => ({ versionId, date: new Date(`${item.date}T00:00:00.000Z`), processId: item.processId, severity: item.severity, code: item.code, message: item.message, missing: item.missing })) });
      await tx.auditEvent.create({ data: { actorId: user.id, action: input.action === "assign" ? "ASSIGNMENT_ADDED" : "ASSIGNMENT_REMOVED", entityType: "RosterVersion", entityId: versionId, details: { date: input.date, processId: process.id, employeeId: employee.id } } });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
