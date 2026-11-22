import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json({ error: error.issues[0]?.message ?? "The submitted data is invalid." }, { status: 400 });
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "P2002") return Response.json({ error: "A record with this key already exists." }, { status: 409 });
    if (code === "P2003") return Response.json({ error: "A referenced record is missing or cannot be changed." }, { status: 409 });
    if (code === "P2034") return Response.json({ error: "The workspace changed during this operation. Refresh and try again." }, { status: 409 });
    if (code === "P2025") return Response.json({ error: "The requested record was not found." }, { status: 404 });
  }

  console.error("Request failed", error);
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return;

  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, "Cross-origin changes are not allowed.");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Invalid request origin.");
  }
}
