import { createImportTemplate } from "@/lib/importer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    return new Response("externalKey,name,podKey,weeklyOffDays,mandatoryOffDays,maxDailyMinutes,active\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=rosterly-employees-template.csv" },
    });
  }
  const workbook = createImportTemplate();
  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=rosterly-workforce-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
