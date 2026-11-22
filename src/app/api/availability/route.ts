import { z } from "zod";
import { requireRoles, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { assertPodAccess, ALL_ROLES } from "@/lib/permissions";

const requestSchema = z.object({
  employeeId: z.string().optional(),
  type: z.enum(["LEAVE", "COMP_OFF", "UNAVAILABLE"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
});
const reviewSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Month must use YYYY-MM format.");
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const employeeFilter = user.role === "ADMIN" || user.role === "OPERATIONS_MANAGER"
      ? {}
      : user.role === "POD_LEAD"
        ? { podId: user.managedPodId ?? "" }
        : { id: user.employeeId ?? "" };
    const requests = await db.employeeAvailability.findMany({
      where: { employee: employeeFilter, startDate: { lte: end }, endDate: { gte: start } },
      include: { employee: { select: { id: true, displayName: true, podId: true, pod: { select: { name: true } } } } },
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
    });
    return Response.json({ requests: requests.map((item) => ({
      id: item.id, employeeId: item.employeeId, employeeName: item.employee.displayName, podId: item.employee.podId,
      podName: item.employee.pod.name, type: item.type, status: item.status,
      startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate.toISOString().slice(0, 10), note: item.note,
    })) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const input = requestSchema.parse(await request.json());
    const employeeId = user.role === "EMPLOYEE" ? user.employeeId : input.employeeId;
    if (!employeeId) throw new HttpError(400, "Choose an employee for this request.");
    if (input.endDate < input.startDate) throw new HttpError(400, "End date must be on or after the start date.");
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, podId: true, active: true } });
    if (!employee?.active) throw new HttpError(404, "Active employee record was not found.");
    if (user.role !== "EMPLOYEE" || employee.id !== user.employeeId) assertPodAccess(user, employee.podId);
    const created = await db.employeeAvailability.create({
      data: { employeeId, type: input.type, startDate: new Date(`${input.startDate}T00:00:00.000Z`), endDate: new Date(`${input.endDate}T00:00:00.000Z`), note: input.note?.trim() || null },
      select: { id: true, status: true },
    });
    await db.auditEvent.create({ data: { actorId: user.id, action: "AVAILABILITY_REQUESTED", entityType: "EmployeeAvailability", entityId: created.id, details: { type: input.type, startDate: input.startDate, endDate: input.endDate } } });
    return Response.json({ request: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD"]);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "A request ID is required.");
    const input = reviewSchema.parse(await request.json());
    const availability = await db.employeeAvailability.findUnique({ where: { id }, include: { employee: { select: { podId: true } } } });
    if (!availability) throw new HttpError(404, "Time-off request was not found.");
    if (availability.status !== "PENDING") throw new HttpError(409, "Only pending requests can be reviewed.");
    assertPodAccess(user, availability.employee.podId);
    if (!ALL_ROLES.includes(user.role) && user.role === "POD_LEAD" && user.managedPodId !== availability.employee.podId) throw new HttpError(403, "You can only review requests from your pod.");
    const updated = await db.employeeAvailability.update({ where: { id }, data: { status: input.status, reviewedBy: user.id, reviewedAt: new Date() }, select: { id: true, status: true } });
    await db.auditEvent.create({ data: { actorId: user.id, action: `AVAILABILITY_${input.status}`, entityType: "EmployeeAvailability", entityId: id } });
    return Response.json({ request: updated });
  } catch (error) {
    return jsonError(error);
  }
}
