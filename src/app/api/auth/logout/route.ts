import { destroySession } from "@/lib/auth";
import { jsonError, requireSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await destroySession();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
