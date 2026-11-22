import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";

const createSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD", "EMPLOYEE"]),
  employeeId: z.string().optional(),
  managedPodId: z.string().optional(),
});

export async function GET() {
  try {
    await requireRoles(["ADMIN"]);
    const users = await db.userAccount.findMany({
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        employeeId: true,
        managedPodId: true,
        isActive: true,
        createdAt: true,
      },
    });
    return Response.json({ users });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireRoles(["ADMIN"]);
    const input = createSchema.parse(await request.json());

    if (input.role === "EMPLOYEE" && !input.employeeId) {
      throw new HttpError(400, "Employee accounts need an employee record.");
    }
    if (input.role === "POD_LEAD" && !input.managedPodId) {
      throw new HttpError(400, "Pod lead accounts need a pod assignment.");
    }
    if (input.role !== "EMPLOYEE" && input.employeeId) {
      throw new HttpError(400, "Only employee accounts can be linked to an employee record.");
    }
    if (input.role !== "POD_LEAD" && input.managedPodId) {
      throw new HttpError(400, "Only pod lead accounts can be linked to a managed pod.");
    }

    if (input.employeeId) {
      const employee = await db.employee.findUnique({ where: { id: input.employeeId }, select: { active: true } });
      if (!employee?.active) throw new HttpError(400, "Choose an active employee record for this account.");
    }
    if (input.managedPodId && !(await db.pod.findUnique({ where: { id: input.managedPodId }, select: { id: true } }))) {
      throw new HttpError(400, "Choose an existing pod for this account.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.userAccount.create({
        data: {
          email: input.email.toLowerCase(), displayName: input.displayName, passwordHash,
          role: input.role, employeeId: input.employeeId, managedPodId: input.managedPodId,
        },
        select: { id: true, email: true, displayName: true, role: true, employeeId: true, managedPodId: true, isActive: true },
      });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "USER_ACCOUNT_CREATED", entityType: "UserAccount", entityId: created.id, details: { role: created.role } } });
      return created;
    });
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
