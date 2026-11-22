import { createHash, timingSafeEqual } from "node:crypto";
import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { parseImport } from "@/lib/importer";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requireRoles(["ADMIN", "OPERATIONS_MANAGER"]);
    const { batchId } = await context.params;
    const batch = await db.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new HttpError(404, "Import preview was not found.");
    if (batch.committedAt) throw new HttpError(409, "This import has already been applied.");
    const saved = batch.result as { state?: string; sha256?: string; counts?: Record<string, number> };
    if (saved.state !== "PREVIEWED" || !saved.sha256) throw new HttpError(409, "This import preview is no longer available.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, "Re-select the original CSV or Excel workbook to apply this preview.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    if (saved.sha256.length !== fileHash.length || !timingSafeEqual(Buffer.from(saved.sha256), Buffer.from(fileHash))) throw new HttpError(409, "The selected file does not match the validated preview. Preview this file again.");
    const [existingPods, existingEmployees, existingBrands, existingProcesses] = await Promise.all([
      db.pod.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.employee.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.brand.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
      db.process.findMany({ where: { externalKey: { not: null } }, select: { externalKey: true } }),
    ]);
    const preview = await parseImport(file.name, bytes, {
      pods: existingPods.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      employees: existingEmployees.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      brands: existingBrands.flatMap((item) => item.externalKey ? [item.externalKey] : []),
      processes: existingProcesses.flatMap((item) => item.externalKey ? [item.externalKey] : []),
    });
    if (preview.errors.length) throw new HttpError(409, "The workbook no longer passes validation. Preview it again and resolve the listed issues.");
    if (preview.rowCount !== batch.rowCount) throw new HttpError(409, "The workbook row count changed. Preview the file again.");
    if (saved.counts && JSON.stringify(saved.counts) !== JSON.stringify(preview.counts)) throw new HttpError(409, "The workbook contents changed. Preview the file again.");
    const data = preview.data;

    const counts = await db.$transaction(async (tx) => {
      const [existingPods, existingEmployees, existingBrands, existingProcesses] = await Promise.all([
        tx.pod.findMany({ where: { externalKey: { not: null } }, select: { id: true, externalKey: true } }),
        tx.employee.findMany({ where: { externalKey: { not: null } }, select: { id: true, externalKey: true } }),
        tx.brand.findMany({ where: { externalKey: { not: null } }, select: { id: true, externalKey: true } }),
        tx.process.findMany({ where: { externalKey: { not: null } }, select: { id: true, externalKey: true } }),
      ]);
      const podIds = new Map(existingPods.flatMap((item) => item.externalKey ? [[item.externalKey, item.id] as const] : []));
      const employeeIds = new Map(existingEmployees.flatMap((item) => item.externalKey ? [[item.externalKey, item.id] as const] : []));
      const brandIds = new Map(existingBrands.flatMap((item) => item.externalKey ? [[item.externalKey, item.id] as const] : []));
      const processIds = new Map(existingProcesses.flatMap((item) => item.externalKey ? [[item.externalKey, item.id] as const] : []));
      for (const item of data.pods) {
        const pod = await tx.pod.upsert({
          where: { externalKey: item.externalKey },
          create: { externalKey: item.externalKey, name: item.name },
          update: { name: item.name },
          select: { id: true },
        });
        podIds.set(item.externalKey, pod.id);
      }

      for (const item of data.employees) {
        const employee = await tx.employee.upsert({
          where: { externalKey: item.externalKey },
          create: {
            externalKey: item.externalKey, displayName: item.name, podId: podIds.get(item.podKey)!,
            weeklyOffDays: item.weeklyOffDays, mandatoryOffDays: item.mandatoryOffDays, maxDailyMinutes: item.maxDailyMinutes, active: item.active,
          },
          update: {
            displayName: item.name, podId: podIds.get(item.podKey)!, weeklyOffDays: item.weeklyOffDays,
            mandatoryOffDays: item.mandatoryOffDays, maxDailyMinutes: item.maxDailyMinutes, active: item.active,
          },
          select: { id: true },
        });
        employeeIds.set(item.externalKey, employee.id);
      }

      for (const item of data.pods) {
        await tx.pod.update({ where: { externalKey: item.externalKey }, data: { leadEmployeeId: item.leadEmployeeKey ? employeeIds.get(item.leadEmployeeKey) : null } });
      }

      for (const item of data.brands) {
        const brand = await tx.brand.upsert({
          where: { externalKey: item.externalKey },
          create: { externalKey: item.externalKey, name: item.name, podId: item.podKey ? podIds.get(item.podKey) : null },
          update: { name: item.name, podId: item.podKey ? podIds.get(item.podKey) : null },
          select: { id: true },
        });
        brandIds.set(item.externalKey, brand.id);
      }

      for (const item of data.processes) {
        const process = await tx.process.upsert({
          where: { externalKey: item.externalKey },
          create: {
            externalKey: item.externalKey, brandId: brandIds.get(item.brandKey)!, name: item.name,
            operatingDays: item.operatingDays, holidayMode: item.holidayMode, minStaff: item.minStaff,
            startMinute: item.startMinute, endMinute: item.endMinute,
          },
          update: {
            brandId: brandIds.get(item.brandKey)!, name: item.name, operatingDays: item.operatingDays,
            holidayMode: item.holidayMode, minStaff: item.minStaff, startMinute: item.startMinute, endMinute: item.endMinute,
          },
          select: { id: true },
        });
        processIds.set(item.externalKey, process.id);
      }

      for (const item of data.rules) {
        await tx.operatingRule.upsert({
          where: { processId_weekday: { processId: processIds.get(item.processKey)!, weekday: item.weekday } },
          create: { processId: processIds.get(item.processKey)!, weekday: item.weekday, isOpen: item.isOpen, minStaff: item.minStaff },
          update: { isOpen: item.isOpen, minStaff: item.minStaff },
        });
      }

      for (const item of data.eligibility) {
        const employeeId = employeeIds.get(item.employeeKey)!;
        const processId = processIds.get(item.processKey)!;
        const validFrom = new Date(`${item.validFrom}T00:00:00.000Z`);
        await tx.employeeEligibility.upsert({
          where: { employeeId_processId_validFrom: { employeeId, processId, validFrom } },
          create: { employeeId, processId, validFrom, validUntil: item.validUntil ? new Date(`${item.validUntil}T00:00:00.000Z`) : null, isBackup: item.isBackup },
          update: { validUntil: item.validUntil ? new Date(`${item.validUntil}T00:00:00.000Z`) : null, isBackup: item.isBackup },
        });
      }

      for (const item of data.availability) {
        const employeeId = employeeIds.get(item.employeeKey)!;
        const startDate = new Date(`${item.startDate}T00:00:00.000Z`);
        const endDate = new Date(`${item.endDate}T00:00:00.000Z`);
        await tx.employeeAvailability.upsert({
          where: { employeeId_type_startDate_endDate: { employeeId, type: item.type, startDate, endDate } },
          create: { employeeId, type: item.type, startDate, endDate, status: item.status, note: item.note },
          update: { status: item.status, note: item.note },
        });
      }

      for (const item of data.holidays) {
        const date = new Date(`${item.date}T00:00:00.000Z`);
        await tx.publicHoliday.upsert({
          where: { date_region: { date, region: item.region } },
          create: { date, name: item.name, region: item.region },
          update: { name: item.name },
        });
      }

      await tx.importBatch.update({ where: { id: batch.id }, data: { committedAt: new Date(), result: { state: "COMMITTED", counts: preview.counts } } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "DATA_IMPORT_COMMITTED", entityType: "ImportBatch", entityId: batch.id, details: { fileName: batch.fileName, rowCount: batch.rowCount, counts: preview.counts } } });
      return preview.counts;
    }, { timeout: 30_000 });
    return Response.json({ ok: true, counts });
  } catch (error) {
    return jsonError(error);
  }
}
