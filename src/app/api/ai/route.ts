import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, requireSameOrigin } from "@/lib/http";
import { loadRosterContext } from "@/lib/planner-data";
import { measureCoverage, type PlannedAssignment } from "@/lib/scheduling/engine";

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), question: z.string().trim().min(3).max(1800) });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL;
    if (!apiKey || !model) throw new HttpError(503, "AI is not configured yet. Add AI_API_KEY and AI_MODEL to the server environment.");

    const { plannerInput, processes, employees } = await loadRosterContext(user, input.month);
    let safeQuestion = input.question
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, (phone) => (phone.match(/\d/g)?.length ?? 0) >= 10 ? "[phone removed]" : phone);
    for (const employee of employees.map((item) => item.displayName).filter((name) => name.length >= 3).sort((left, right) => right.length - left.length)) {
      safeQuestion = safeQuestion.replace(new RegExp(`\\b${escapeRegex(employee)}\\b`, "gi"), "[employee]");
    }
    const roster = await db.roster.findUnique({ where: { month: new Date(`${input.month}-01T00:00:00.000Z`) } });
    const version = roster ? await db.rosterVersion.findFirst({
      where: { rosterId: roster.id, ...(user.role === "EMPLOYEE" ? { status: "PUBLISHED" as const } : {}) },
      orderBy: { number: "desc" }, include: { assignments: { where: { processId: { in: processes.map((item) => item.id) }, employeeId: { in: employees.map((item) => item.id) } } } },
    }) : null;
    const assignments: PlannedAssignment[] = version?.assignments.map((item) => ({
      date: item.date.toISOString().slice(0, 10), employeeId: item.employeeId, processId: item.processId, brandId: "", source: "GENERATED",
    })) ?? [];
    const coverage = version ? measureCoverage(plannerInput, assignments) : null;
    const issues = version ? await db.rosterIssue.findMany({ where: { versionId: version.id, processId: { in: processes.map((item) => item.id) } }, select: { code: true, severity: true, processId: true, missing: true } }) : [];
    const processNames = new Map(processes.map((item) => [item.id, `${item.brand.name} / ${item.name}`]));
    const issueSummary = issues.reduce<Record<string, { count: number; missing: number; severity: string }>>((summary, issue) => {
      const key = `${issue.code} · ${processNames.get(issue.processId) ?? "Process"}`;
      const current = summary[key] ?? { count: 0, missing: 0, severity: issue.severity };
      current.count += 1;
      current.missing += issue.missing;
      if (issue.severity === "ERROR") current.severity = "ERROR";
      summary[key] = current;
      return summary;
    }, {});

    const baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        messages: [
          { role: "system", content: "You are Rosterly's workforce planning assistant. Explain operational roster conflicts in plain language and suggest concrete human review steps. Never claim you changed or approved a roster. Scheduling validation is deterministic and authoritative. You only receive aggregate or process-level information; do not ask for employee names or personal data. Keep the answer concise and distinguish observed facts from suggestions." },
          { role: "user", content: JSON.stringify({ month: input.month, question: safeQuestion, rosterStatus: version?.status ?? "No roster generated", coverage, processIssueSummary: issueSummary }) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new HttpError(502, "The AI provider could not complete the request. Check its endpoint, model, and server key.");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const content = payload.choices?.[0]?.message?.content;
    const answer = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : "";
    if (!answer.trim()) throw new HttpError(502, "The AI provider returned an empty response.");
    return Response.json({ answer, provider: process.env.AI_PROVIDER_LABEL ?? "Configured AI provider" });
  } catch (error) {
    return jsonError(error);
  }
}
