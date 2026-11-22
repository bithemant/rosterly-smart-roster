import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { loadRosterContext } from "@/lib/planner-data";
import { validateMonthlyRoster, type PlannedAssignment } from "@/lib/scheduling/engine";

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER"]);
    const { versionId } = await context.params;
    const version = await db.rosterVersion.findUnique({ where: { id: versionId }, include: { roster: true, assignments: true } });
    if (!version) throw new HttpError(404, "Roster version was not found.");
    if (version.status !== "DRAFT") throw new HttpError(409, "Only a draft roster can be published.");

    const month = version.roster.month.toISOString().slice(0, 7);
    const { plannerInput } = await loadRosterContext(user, month);
    const assignments: PlannedAssignment[] = version.assignments.map((item) => ({
      date: item.date.toISOString().slice(0, 10), employeeId: item.employeeId, processId: item.processId, brandId: "", source: "GENERATED",
    }));
    const issues = validateMonthlyRoster(plannerInput, assignments);
    const errors = issues.filter((issue) => issue.severity === "ERROR");
    if (errors.length) {
      await db.rosterIssue.deleteMany({ where: { versionId } });
      await db.rosterIssue.createMany({ data: issues.map((item) => ({
        versionId,
        date: new Date(`${item.date}T00:00:00.000Z`),
        processId: item.processId,
        severity: item.severity,
        code: item.code,
        message: item.message,
        missing: item.missing,
      })) });
      throw new HttpError(409, `Resolve ${errors.length} blocking roster issue${errors.length === 1 ? "" : "s"} before publishing.`);
    }

    const published = await db.$transaction(async (tx) => {
      const claimed = await tx.rosterVersion.updateMany({
        where: { id: versionId, status: "DRAFT", revision: version.revision },
        data: { status: "PUBLISHED", publishedById: user.id, publishedAt: new Date(), revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new HttpError(409, "This draft changed after validation. Refresh and publish again.");
      const result = await tx.rosterVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { id: true, number: true, status: true, publishedAt: true },
      });
      await tx.rosterIssue.deleteMany({ where: { versionId } });
      if (issues.length) await tx.rosterIssue.createMany({ data: issues.map((item) => ({
        versionId, date: new Date(`${item.date}T00:00:00.000Z`), processId: item.processId, severity: item.severity, code: item.code, message: item.message, missing: item.missing,
      })) });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "ROSTER_PUBLISHED", entityType: "RosterVersion", entityId: versionId, details: { month } } });
      return result;
    });
    return Response.json({ version: published });
  } catch (error) {
    return jsonError(error);
  }
}
