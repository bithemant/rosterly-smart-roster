import { z } from "zod";
import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, requireSameOrigin } from "@/lib/http";
import { loadRosterContext } from "@/lib/planner-data";
import { buildMonthlyRoster } from "@/lib/scheduling/engine";

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER"]);
    const { month } = schema.parse(await request.json());
    const context = await loadRosterContext(user, month);
    if (context.employees.length === 0 || context.processes.length === 0) {
      return Response.json({ error: "Import employees, processes, and eligibility before generating a roster." }, { status: 409 });
    }

    const output = buildMonthlyRoster(context.plannerInput);
    const monthDate = new Date(`${month}-01T00:00:00.000Z`);
    const version = await db.$transaction(async (tx) => {
      const roster = await tx.roster.upsert({
        where: { month: monthDate },
        create: { month: monthDate },
        update: {},
      });
      const latest = await tx.rosterVersion.findFirst({ where: { rosterId: roster.id }, orderBy: { number: "desc" }, select: { number: true } });
      await tx.rosterVersion.updateMany({ where: { rosterId: roster.id, status: "DRAFT" }, data: { status: "ARCHIVED" } });
      const created = await tx.rosterVersion.create({
        data: {
          rosterId: roster.id,
          number: (latest?.number ?? 0) + 1,
          createdById: user.id,
          changeSummary: "Generated from current employee, process, eligibility, holiday, and approved availability data.",
          assignments: { createMany: { data: output.assignments.map((item) => ({
            date: new Date(`${item.date}T00:00:00.000Z`), employeeId: item.employeeId, processId: item.processId, source: "GENERATED",
          })) } },
          issues: { createMany: { data: output.issues.map((item) => ({
            date: new Date(`${item.date}T00:00:00.000Z`), processId: item.processId, severity: item.severity, code: item.code, message: item.message, missing: item.missing,
          })) } },
        },
        select: { id: true, number: true, status: true },
      });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "ROSTER_GENERATED", entityType: "RosterVersion", entityId: created.id, details: { month, assignments: output.assignments.length, issues: output.issues.length } } });
      return created;
    }, { isolationLevel: "Serializable" });

    return Response.json({ version, totals: output.totals, issueCount: output.issues.length }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
