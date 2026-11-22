import { createHash } from "node:crypto";
import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { parseImport } from "@/lib/importer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function GET() {
  try {
    await requireRoles(["ADMIN", "OPERATIONS_MANAGER"]);
    const batches = await db.importBatch.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, rowCount: true, createdAt: true, committedAt: true, uploadedBy: { select: { displayName: true } } },
    });
    return Response.json({ batches: batches.map((batch) => ({ ...batch, createdAt: batch.createdAt.toISOString(), committedAt: batch.committedAt?.toISOString() ?? null })) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a CSV or Excel workbook to import.");
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "The import file must be between 1 byte and 8 MB.");
    const [pods, employees, brands, processes] = await Promise.all([
      db.pod.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.employee.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.brand.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.process.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
    ]);
    const existingKeys = {
      pods: pods.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      employees: employees.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      brands: brands.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      processes: processes.flatMap((item) => item.externalKey ? [item.externalKey] : []),
    };
    const bytes = Buffer.from(await file.arrayBuffer());
    const preview = await parseImport(file.name, bytes, existingKeys);
    if (preview.rowCount === 0) preview.errors.push("The workbook has no data rows. Add source rows before import.");
    if (preview.rowCount > 20_000) throw new HttpError(413, "The workbook contains more than 20,000 rows. Split it into smaller imports.");
    const batch = await db.importBatch.create({
      data: { uploadedById: user.id, fileName: file.name.slice(0, 255), rowCount: preview.rowCount, result: { state: "PREVIEWED", sha256: createHash("sha256").update(bytes).digest("hex"), counts: preview.counts } },
      select: { id: true, rowCount: true, createdAt: true },
    });
    return Response.json({ batch: { ...batch, createdAt: batch.createdAt.toISOString() }, preview: { counts: preview.counts, rowCount: preview.rowCount, errors: preview.errors } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
