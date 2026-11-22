import "server-only";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";

const schema = z.object({
  setupToken: z.string().min(24).max(256),
  email: z.email().max(254),
  displayName: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(128),
});

function tokenMatches(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = schema.parse(await request.json());
    const expectedToken = process.env.SETUP_TOKEN;
    if (!expectedToken || expectedToken.length < 24 || expectedToken === "replace-before-first-admin-setup" || !tokenMatches(input.setupToken, expectedToken)) {
      throw new HttpError(403, "The setup token is invalid or not configured.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.$transaction(async (tx) => {
      if (await tx.userAccount.count() > 0) {
        throw new HttpError(409, "Initial setup has already been completed.");
      }

      await tx.systemSetting.create({
        data: { key: "BOOTSTRAP_COMPLETE", value: { at: new Date().toISOString() } },
      });
      return tx.userAccount.create({
        data: {
          email: input.email.toLowerCase(),
          displayName: input.displayName,
          passwordHash,
          role: "ADMIN",
        },
        select: { id: true, email: true, displayName: true, role: true, employeeId: true, managedPodId: true },
      });
    }, { isolationLevel: "Serializable" });

    await createSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return Response.json({ error: "Initial setup has already been completed." }, { status: 409 });
    }
    return jsonError(error);
  }
}
