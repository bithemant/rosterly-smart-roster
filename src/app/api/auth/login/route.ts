import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

const timingHash = "$2b$12$9uYRH/qyEZFPnVp4AXQzSuxf1YS6NMu0pO9BvgXD05jJ0VqTwn.4C";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = schema.parse(await request.json());
    const user = await db.userAccount.findUnique({ where: { email: input.email.toLowerCase() } });
    const hash = user?.passwordHash ?? timingHash;
    const passwordValid = await bcrypt.compare(input.password, hash);

    if (!user || !user.isActive || !passwordValid || (user.lockedUntil && user.lockedUntil > new Date())) {
      if (user?.isActive && (!user.lockedUntil || user.lockedUntil <= new Date())) {
        const failures = user.failedLoginAttempts + 1;
        await db.userAccount.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: failures >= 5 ? 0 : failures,
            lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          },
        });
      }
      throw new HttpError(401, "Email or password is incorrect.");
    }

    await db.userAccount.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await createSession(user.id);

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        employeeId: user.employeeId,
        managedPodId: user.managedPodId,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
