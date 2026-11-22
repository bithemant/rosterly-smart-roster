import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [user, count] = await Promise.all([
      getSessionUser(),
      db.userAccount.count(),
    ]);
    return Response.json({
      configured: true,
      connected: true,
      hasUsers: count > 0,
      user,
      aiReady: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    });
  } catch {
    return Response.json({ configured: true, connected: false, hasUsers: false, user: null });
  }
}
