"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowDownToLine, ArrowRight, Bot, CalendarDays, Check, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, Database, FileSpreadsheet, LayoutDashboard, LoaderCircle, LogOut,
  RefreshCw, Send, Settings2, Shield, Sparkles, Upload, Users, WandSparkles, X,
} from "lucide-react";

type Role = "ADMIN" | "OPERATIONS_MANAGER" | "POD_LEAD" | "EMPLOYEE";
type User = { id: string; displayName: string; email: string; role: Role; employeeId: string | null; managedPodId: string | null };
type Assignment = { id: string; date: string; employeeId: string; employeeName: string; podId: string; processId: string; processName: string; brandId: string; brandName: string; source: "GENERATED" | "MANUAL" };
type Issue = { date: string; processId: string; processName: string; brandName: string; severity: "ERROR" | "WARNING"; code: string; message: string; missing: number };
type Overview = {
  user: User;
  month: string;
  counts: { employees: number; brands: number; processes: number };
  coverage: null | { requiredSlots: number; filledSlots: number; gapSlots: number; coveragePercent: number };
  version: null | { id: string; number: number; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; createdAt: string; publishedAt: string | null };
  employees: Array<{ id: string; name: string; podId: string; podName: string }>;
  pods: Array<{ id: string; name: string; leadEmployeeId: string | null }>;
  brands: Array<{ id: string; name: string; podId: string | null }>;
  processes: Array<{ id: string; name: string; brandId: string; brandName: string; podId: string | null; minStaff: number }>;
  assignments: Assignment[];
  issues: Issue[];
  podSummary: Array<{ id: string; name: string; leadName: string | null; employeeCount: number; coverage: number | null; gapSlots: number | null }>;
  aiReady: boolean;
};
type AvailabilityItem = { id: string; employeeId: string; employeeName: string; podId: string; podName: string; type: "LEAVE" | "COMP_OFF" | "UNAVAILABLE"; status: "PENDING" | "APPROVED" | "REJECTED"; startDate: string; endDate: string; note: string | null };
type AccessUser = { id: string; email: string; displayName: string; role: Role; employeeId: string | null; managedPodId: string | null; isActive: boolean; createdAt: string };
type Section = "overview" | "roster" | "availability" | "import" | "assistant" | "access";

const roleNames: Record<Role, string> = { ADMIN: "Administrator", OPERATIONS_MANAGER: "Operations manager", POD_LEAD: "Pod lead", EMPLOYEE: "Employee" };
const sectionNames: Record<Section, string> = { overview: "Overview", roster: "Monthly roster", availability: "Availability", import: "Data import", assistant: "AI assistant", access: "User access" };
const managerRoles: Role[] = ["ADMIN", "OPERATIONS_MANAGER"];
const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const localMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "The request could not be completed.");
  return payload as T;
}

function monthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index + 1));
    return { date: date.toISOString().slice(0, 10), day: index + 1, weekday: weekLabels[(date.getUTCDay() + 6) % 7] };
  });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "R";
}

function csvEscape(value: string) { return `"${value.replaceAll('"', '""')}"`; }

function IconButton({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
  return <button className="button" type="button" title={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function Workspace({ user, aiReady, onSignOut }: { user: User; aiReady: boolean; onSignOut: () => void }) {
  const [section, setSection] = useState<Section>("overview");
  const [month, setMonth] = useState(localMonth);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [importHistory, setImportHistory] = useState<Array<{ id: string; fileName: string; rowCount: number; createdAt: string; committedAt: string | null; uploadedBy: { displayName: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editAction, setEditAction] = useState<"assign" | "unassign">("assign");
  const [editForm, setEditForm] = useState({ date: `${month}-01`, employeeId: "", processId: "" });
  const isManager = managerRoles.includes(user.role);
  const canEditDraft = ["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD"].includes(user.role);
  const displayMonth = useMemo(() => new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)), [month]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<Overview>(`/api/overview?month=${month}`);
      setOverview(data);
      const availabilityResult = await fetchJson<{ requests: AvailabilityItem[] }>(`/api/availability?month=${month}`);
      setAvailability(availabilityResult.requests);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load workspace data.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 3600);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (section !== "access" || user.role !== "ADMIN") return;
    void fetchJson<{ users: AccessUser[] }>("/api/auth/users").then((result) => setAccessUsers(result.users)).catch((caught) => setError(caught.message));
  }, [section, user.role]);
  useEffect(() => {
    if (section !== "import" || !isManager) return;
    void fetchJson<{ batches: typeof importHistory }>("/api/import").then((result) => setImportHistory(result.batches)).catch((caught) => setError(caught.message));
  }, [section, isManager]);

  async function signOut() {
    try { await fetchJson("/api/auth/logout", { method: "POST" }); } finally { onSignOut(); }
  }

  async function generateRoster() {
    setBusy(true); setError("");
    try {
      const result = await fetchJson<{ version: { number: number }; totals: { gapSlots: number }; issueCount: number }>("/api/rosters/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
      setToast(`Draft version ${result.version.number} created · ${result.totals.gapSlots} coverage gap${result.totals.gapSlots === 1 ? "" : "s"} to review.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Roster generation failed."); }
    finally { setBusy(false); }
  }

  async function publishRoster() {
    if (!overview?.version) return;
    setBusy(true); setError("");
    try {
      await fetchJson(`/api/rosters/${overview.version.id}/publish`, { method: "POST" });
      setToast("Roster published and available to employees.");
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not publish the roster."); }
    finally { setBusy(false); }
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview?.version) return;
    setBusy(true); setError("");
    try {
      await fetchJson(`/api/rosters/${overview.version.id}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editAction, ...editForm }) });
      setEditOpen(false); setToast(editAction === "assign" ? "Assignment added to the draft." : "Assignment removed from the draft."); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the assignment."); }
    finally { setBusy(false); }
  }

  async function reviewAvailability(id: string, status: "APPROVED" | "REJECTED") {
    try {
      await fetchJson(`/api/availability?id=${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setToast(`Request ${status.toLowerCase()}.`); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not review this request."); }
  }

  function exportRoster() {
    if (!overview) return;
    const rows = [["Date", "Employee", "Pod", "Brand", "Process", "Source"], ...overview.assignments.map((item) => [item.date, item.employeeName, overview.employees.find((employee) => employee.id === item.employeeId)?.podName ?? "", item.brandName, item.processName, item.source])];
    const blob = new Blob([rows.map((row) => row.map((value) => csvEscape(value)).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `rosterly-${month}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const navItems = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { id: "roster" as const, label: "Monthly roster", icon: CalendarDays },
    { id: "availability" as const, label: "Availability", icon: Clock3 },
    ...(isManager ? [{ id: "import" as const, label: "Data import", icon: FileSpreadsheet }] : []),
    { id: "assistant" as const, label: "AI assistant", icon: Sparkles },
    ...(user.role === "ADMIN" ? [{ id: "access" as const, label: "User access", icon: Shield }] : []),
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup" aria-label="Rosterly"><span className="brand-mark" /><span className="brand-name">rosterly<span>.</span></span></div>
        <div className="workspace-card"><span className="workspace-avatar">R</span><span className="workspace-meta"><strong>Roster workspace</strong><small>Workforce operations</small></span></div>
        <div className="nav-label">Workspace</div>
        <nav className="primary-nav" aria-label="Workspace navigation">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${section === id ? "active" : ""}`} onClick={() => { setSection(id); setError(""); }}><Icon />{label}{id === "availability" && availability.filter((item) => item.status === "PENDING").length > 0 && <span className="nav-count">{availability.filter((item) => item.status === "PENDING").length}</span>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-ai-card"><div className="sidebar-ai-top"><Sparkles /> AI planning assistant <span className={`connection-dot ${aiReady ? "is-on" : ""}`} /></div><p>{aiReady ? "Provider connected. Ask for an explanation of current coverage issues." : "Add a provider key in your server environment to enable AI guidance."}</p></div>
        <div className="profile-chip"><span className="avatar">{initials(user.displayName)}</span><span className="profile-meta"><strong>{user.displayName}</strong><small>{roleNames[user.role]}</small></span><button type="button" className="signout-button" title="Sign out" onClick={() => void signOut()}><LogOut /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Rosterly</span><ChevronRight size={12} /><strong>{sectionNames[section]}</strong></div><div className="topbar-actions"><span className="role-pill">{roleNames[user.role]}</span><label className="sr-only" htmlFor="workspace-month">Selected month</label><input id="workspace-month" className="month-select" type="month" value={month} onChange={(event) => { const nextMonth = event.target.value; setMonth(nextMonth); setEditForm((current) => ({ ...current, date: `${nextMonth}-01` })); }} /></div></header>
        <div className="page-heading"><div><span className="page-eyebrow">{section === "overview" ? "WORKFORCE OPERATIONS" : `ROSTERLY / ${sectionNames[section].toUpperCase()}`}</span><h1>{section === "overview" ? `Good ${timeGreeting()}, ${user.displayName.split(" ")[0]}.` : sectionNames[section]}</h1><p>{section === "overview" ? `Here’s the operating picture for ${displayMonth}.` : sectionSubtitle(section)}</p></div><div className="heading-actions">
          {section === "overview" && isManager && <button className="button button-primary" type="button" disabled={busy || !overview?.counts.employees || !overview?.counts.processes} onClick={() => void generateRoster()}>{busy ? <LoaderCircle className="spin" /> : <WandSparkles />} Generate roster</button>}
          {section === "roster" && <><button className="button" type="button" disabled={!overview?.assignments.length} onClick={exportRoster}><ArrowDownToLine /> Export CSV</button>{isManager && overview?.version?.status === "DRAFT" && <button className="button button-primary" type="button" disabled={busy} onClick={() => void publishRoster()}><CheckCircle2 /> Publish roster</button>}</>}
          {section === "roster" && canEditDraft && overview?.version?.status === "DRAFT" && <button className="button button-coral" type="button" onClick={() => setEditOpen(true)}><Settings2 /> Adjust assignment</button>}
          {section !== "overview" && <IconButton title="Refresh" onClick={() => void refresh()}><RefreshCw /></IconButton>}
        </div></div>
        {error && <div className="notice error page-notice"><AlertCircle /> <span>{error}</span><button type="button" className="notice-dismiss" onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
        {loading && !overview ? <div className="panel loading-inline">Loading current workforce data…</div> : null}
        {overview && section === "overview" && <OverviewPage data={overview} availability={availability} isManager={isManager} onNavigate={setSection} onGenerate={() => void generateRoster()} busy={busy} />}
        {overview && section === "roster" && <RosterPage data={overview} month={month} canEdit={canEditDraft && overview.version?.status === "DRAFT"} />}
        {section === "availability" && <AvailabilityPage key={month} user={user} employees={overview?.employees ?? []} requests={availability} month={month} onRefresh={refresh} onReview={reviewAvailability} />}
        {section === "import" && isManager && <ImportPage history={importHistory} onHistory={async () => { const result = await fetchJson<{ batches: typeof importHistory }>("/api/import"); setImportHistory(result.batches); }} />}
        {section === "assistant" && overview && <AssistantPage month={month} aiReady={aiReady} />}
        {section === "access" && user.role === "ADMIN" && overview && <AccessPage users={accessUsers} employees={overview.employees} pods={overview.pods} onCreated={(created) => setAccessUsers((current) => [...current, created])} />}
      </main>
      {editOpen && overview?.version && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="assignment-title"><div className="modal-heading"><div><h2 id="assignment-title">Adjust draft assignment</h2><p>Every change is revalidated and recorded in the audit history.</p></div><button className="signout-button modal-close" onClick={() => setEditOpen(false)} aria-label="Close"><X /></button></div><form onSubmit={(event) => void saveAssignment(event)} className="access-form"><div className="form-field full-span"><label htmlFor="assignment-action">Change</label><select id="assignment-action" className="form-select" value={editAction} onChange={(event) => setEditAction(event.target.value as "assign" | "unassign")}><option value="assign">Add an assignment</option><option value="unassign">Remove an assignment</option></select></div><div className="form-field"><label htmlFor="assignment-date">Date</label><input id="assignment-date" className="form-input" type="date" required min={`${month}-01`} max={`${month}-${String(monthDays(month).length).padStart(2, "0")}`} value={editForm.date} onChange={(event) => setEditForm({ ...editForm, date: event.target.value })} /></div><div className="form-field"><label htmlFor="assignment-employee">Employee</label><select id="assignment-employee" className="form-select" required value={editForm.employeeId} onChange={(event) => setEditForm({ ...editForm, employeeId: event.target.value })}><option value="">Select employee</option>{overview.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.podName}</option>)}</select></div><div className="form-field full-span"><label htmlFor="assignment-process">Process</label><select id="assignment-process" className="form-select" required value={editForm.processId} onChange={(event) => setEditForm({ ...editForm, processId: event.target.value })}><option value="">Select brand / process</option>{overview.processes.map((process) => <option key={process.id} value={process.id}>{process.brandName} / {process.name}</option>)}</select></div><div className="form-actions full-span"><button type="button" className="button" onClick={() => setEditOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save change"}</button></div></form></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function timeGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function sectionSubtitle(section: Section) {
  const map: Record<Section, string> = {
    overview: "Review coverage, exceptions, and the team’s current operating picture.",
    roster: "Inspect daily assignments and make controlled changes to a draft.",
    availability: "Submit, review, and track time away and availability requests.",
    import: "Bring in real workforce rules from a reviewed CSV or Excel workbook.",
    assistant: "Get a concise explanation of roster issues and planning options.",
    access: "Create named accounts and assign the least access needed for each role.",
  };
  return map[section];
}

function Metric({ label, value, foot, icon, tone = "" }: { label: string; value: string | number; foot: string; icon: React.ReactNode; tone?: string }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-label">{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></article>;
}

function OverviewPage({ data, availability, isManager, onNavigate, onGenerate, busy }: { data: Overview; availability: AvailabilityItem[]; isManager: boolean; onNavigate: (section: Section) => void; onGenerate: () => void; busy: boolean }) {
  const pending = availability.filter((item) => item.status === "PENDING").length;
  const openIssues = data.issues.filter((item) => item.severity === "ERROR").length;
  return <>
    <section className="metric-grid">
      <Metric label="Active employees in scope" value={data.counts.employees} foot="From your current roster data" icon={<Users />} />
      <Metric label="Brands and processes" value={`${data.counts.brands} / ${data.counts.processes}`} foot="Operating resources loaded" icon={<Database />} tone="coral" />
      <Metric label="Roster coverage" value={data.coverage ? `${data.coverage.coveragePercent}%` : "—"} foot={data.coverage ? `${data.coverage.gapSlots} uncovered required slots` : "Generate a draft to calculate coverage"} icon={<CheckCircle2 />} tone="blue" />
      <Metric label="Requests awaiting review" value={pending} foot={data.issues.length ? `${openIssues} blocking roster issues` : "Availability requests in this month"} icon={<Clock3 />} tone="amber" />
    </section>
    {!data.counts.employees || !data.counts.processes ? <section className="panel onboarding-panel"><div className="onboarding-mark"><Database /></div><div><span className="eyebrow">WORKSPACE SETUP</span><h2>Add your real operating data</h2><p>Rosterly is connected to its database and ready for your anonymized workbook. Upload the employee, pod, brand, process, eligibility, leave, and holiday sheets to see a real coverage plan here.</p><div className="onboarding-points"><span><Check size={14} /> No sample people or roster data</span><span><Check size={14} /> Validate before committing</span><span><Check size={14} /> Private database import history</span></div></div>{isManager && <button className="button button-primary" onClick={() => onNavigate("import")}><Upload /> Go to data import <ArrowRight /></button>}</section> : null}
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-header"><div><h2>Coverage health</h2><p>{data.version ? `Version ${data.version.number} · ${data.version.status.toLowerCase()}` : "No roster version for this month yet"}</p></div>{data.version && <span className={`status-pill ${data.version.status === "PUBLISHED" ? "ok" : "warning"}`}>{data.version.status}</span>}</div>{data.coverage ? <div className="coverage-summary"><div className="coverage-line"><span>Required assignments filled</span><strong>{data.coverage.coveragePercent}%</strong></div><div className="coverage-meter"><i style={{ width: `${data.coverage.coveragePercent}%` }} /></div><div className="coverage-legend"><span><strong>{data.coverage.filledSlots}</strong> filled</span><span><strong>{data.coverage.gapSlots}</strong> uncovered</span><span><strong>{data.coverage.requiredSlots}</strong> required</span></div></div> : <div className="empty-state compact"><div className="empty-icon"><CalendarDays /></div><h3>Plan not generated yet</h3><p>Coverage appears after you load eligibility rules and generate a draft roster.</p>{isManager && data.counts.employees > 0 && data.counts.processes > 0 && <button className="button button-primary" onClick={onGenerate} disabled={busy}><WandSparkles /> Generate first draft</button>}</div>}
        <div className="panel-header subtle-header"><div><h2>Pod coverage</h2><p>Current month by operating team</p></div><button type="button" className="panel-link" onClick={() => onNavigate("roster")}>Open roster <ChevronRight size={12} /></button></div>{data.podSummary.length ? <div className="pod-list">{data.podSummary.map((pod) => <div className="pod-row" key={pod.id}><span className="pod-symbol">{initials(pod.name)}</span><span className="pod-meta"><strong>{pod.name}</strong><small>{pod.employeeCount} people{pod.leadName ? ` · lead ${pod.leadName}` : ""}</small></span><span className="pod-coverage">{pod.coverage === null ? "—" : `${pod.coverage}%`}<small>{pod.gapSlots === null ? "No roster" : `${pod.gapSlots} gaps`}</small></span></div>)}</div> : <div className="panel-empty-note">Pod information appears after workforce data is imported.</div>}</section>
      <div><section className="panel"><div className="panel-header"><div><h2>Roster status</h2><p>{data.version?.publishedAt ? `Published ${new Date(data.version.publishedAt).toLocaleDateString()}` : "Version and review state"}</p></div><CalendarDays size={17} className="muted" /></div><div className="status-detail"><div className="status-detail-row"><span>Selected month</span><strong>{new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${data.month}-01T00:00:00Z`))}</strong></div><div className="status-detail-row"><span>Latest version</span><strong>{data.version ? `v${data.version.number}` : "Not created"}</strong></div><div className="status-detail-row"><span>Pending availability</span><strong>{pending}</strong></div><div className="status-detail-row"><span>Blocking issues</span><strong className={openIssues ? "text-danger" : "text-blue"}>{openIssues}</strong></div></div><button className="panel-footer-button" onClick={() => onNavigate("availability")}>Review availability <ArrowRight size={13} /></button></section>
      <section className="panel ai-summary-card"><div className="ai-summary-icon"><Sparkles /></div><h2>Planning assistant</h2><p>{data.aiReady ? "Ask the assistant to explain coverage issues using process-level data." : "Choose an OpenAI-compatible provider and add its key on the server to activate AI guidance."}</p><button className="button" onClick={() => onNavigate("assistant")}>Open AI assistant <ArrowRight /></button></section></div>
    </div>
    {data.issues.length > 0 && <section className="panel issues-panel"><div className="panel-header"><div><h2>Roster issues</h2><p>{data.issues.length} item{data.issues.length === 1 ? "" : "s"} found by the scheduling validator</p></div><button className="panel-link" onClick={() => onNavigate("roster")}>Review roster <ChevronRight size={12} /></button></div><div className="issue-list">{data.issues.slice(0, 8).map((issue, index) => <div className="issue-row" key={`${issue.date}-${issue.processId}-${issue.code}-${index}`}><span className={`issue-mark ${issue.severity === "ERROR" ? "error" : ""}`} /><div className="issue-content"><strong>{issue.brandName} / {issue.processName} · {issue.code.replaceAll("_", " ").toLowerCase()}</strong><p>{issue.message}</p></div><span className="issue-date">{new Date(`${issue.date}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" })}</span></div>)}</div></section>}
  </>;
}

function RosterPage({ data, month, canEdit }: { data: Overview; month: string; canEdit: boolean }) {
  const [pod, setPod] = useState("all");
  const [brand, setBrand] = useState("all");
  const days = monthDays(month);
  const employees = data.employees.filter((employee) => pod === "all" || employee.podId === pod);
  const assignments = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const item of data.assignments) {
      if (brand !== "all" && item.brandId !== brand) continue;
      const key = `${item.employeeId}|${item.date}`;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [data.assignments, brand]);
  return <section className="panel roster-panel"><div className="roster-toolbar"><select className="filter-select" aria-label="Filter by pod" value={pod} onChange={(event) => setPod(event.target.value)}><option value="all">All pods</option>{data.pods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="filter-select" aria-label="Filter by brand" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">All brands</option>{data.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="toolbar-spacer" /><span className={`status-pill ${data.version?.status === "PUBLISHED" ? "ok" : data.version ? "warning" : "neutral"}`}>{data.version ? `${data.version.status} · v${data.version.number}` : "No roster"}</span></div>
    {!data.version ? <div className="empty-state"><div className="empty-icon"><CalendarDays /></div><h3>There is no roster for {new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</h3><p>Import your workforce data and generate a draft before reviewing daily assignments.</p></div> : !employees.length ? <div className="empty-state"><h3>No employees in this view</h3><p>Try a different pod filter.</p></div> : <div className="table-wrap"><table className="roster-table"><thead><tr><th className="employee-cell">EMPLOYEE / POD</th>{days.map((day) => <th key={day.date} className="day-cell"><span>{day.weekday}</span><br />{day.day}</th>)}</tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td className="employee-cell"><div className="employee-cell-wrap"><span className="avatar">{initials(employee.name)}</span><span><strong className="employee-name">{employee.name}</strong><small className="employee-sub">{employee.podName}</small></span></div></td>{days.map((day) => {
      const items = assignments.get(`${employee.id}|${day.date}`) ?? [];
      const names = items.map((item) => `${item.brandName} / ${item.processName}`);
      return <td key={day.date} className="day-cell" title={names.join("; ") || `${day.date}: no assignment`}><span className={`day-chip ${items.length ? "assigned" : "off"}`}>{items.length ? items.length > 1 ? `${items.length}×` : (items[0].source === "MANUAL" ? "M" : "•") : "—"}</span>{items.length > 0 && <span className="cell-tooltip">{names.join(" · ")}</span>}</td>;
    })}</tr>)}</tbody></table></div>}
    {data.version && <div className="table-footer"><span>{employees.length} employees · {data.assignments.length} assignments · {days.length} days</span><span>{canEdit ? "Draft changes are validated before publication." : data.version.status === "PUBLISHED" ? "Published roster · read only" : "Read only for your role"}</span></div>}
  </section>;
}

function AvailabilityPage({ user, employees, requests, month, onRefresh, onReview }: { user: User; employees: Overview["employees"]; requests: AvailabilityItem[]; month: string; onRefresh: () => Promise<void>; onReview: (id: string, status: "APPROVED" | "REJECTED") => Promise<void> }) {
  const canReview = ["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD"].includes(user.role);
  const isManager = user.role !== "EMPLOYEE";
  const [form, setForm] = useState({ employeeId: "", type: "LEAVE", startDate: `${month}-01`, endDate: `${month}-01`, note: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await fetchJson("/api/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(isManager ? { employeeId: form.employeeId } : {}), type: form.type, startDate: form.startDate, endDate: form.endDate, note: form.note }) });
      setForm((current) => ({ ...current, note: "" })); await onRefresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not submit request."); }
    finally { setBusy(false); }
  }
  const sorted = [...requests].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <div className="workspace-columns"><section className="panel import-card"><div className="panel-header no-gutter"><div><h2>Request availability</h2><p>Leave and comp-off requests are stored against your roster records.</p></div><Clock3 size={17} className="muted" /></div>{error && <div className="form-error form-spaced">{error}</div>}<form className="access-form form-top-gap" onSubmit={(event) => void submit(event)}>{isManager && <div className="form-field full-span"><label htmlFor="availability-employee">Employee</label><select id="availability-employee" className="form-select" required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Select employee</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}<div className="form-field"><label htmlFor="availability-type">Request type</label><select id="availability-type" className="form-select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="LEAVE">Leave</option><option value="COMP_OFF">Comp-off</option><option value="UNAVAILABLE">Unavailable</option></select></div><div className="form-field"><label htmlFor="availability-start">Start date</label><input id="availability-start" className="form-input" type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div><div className="form-field"><label htmlFor="availability-end">End date</label><input id="availability-end" className="form-input" type="date" min={form.startDate} required value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div><div className="form-field full-span"><label htmlFor="availability-note">Note <span className="muted">(optional)</span></label><textarea id="availability-note" className="form-input form-textarea" maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add context for the reviewer" /></div><div className="form-actions full-span"><button className="button button-primary" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></div></form><div className="notice form-top-gap"><CircleHelp /><span>Only approved availability blocks generated assignments. Managers review requests before roster generation.</span></div></section>
    <section className="panel"><div className="panel-header"><div><h2>Requests for {new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</h2><p>{sorted.length} request{sorted.length === 1 ? "" : "s"} visible in your role scope</p></div><button className="panel-link" onClick={() => void onRefresh()}>Refresh <RefreshCw size={12} /></button></div>{sorted.length ? <div className="request-list">{sorted.map((item) => <article className="request-card" key={item.id}><div className="request-title"><strong>{item.employeeName}</strong><span className={`status-pill ${item.status === "APPROVED" ? "ok" : item.status === "REJECTED" ? "error" : "warning"}`}>{item.status}</span></div><p>{item.type.replaceAll("_", " ")} · {formatDate(item.startDate)}{item.endDate !== item.startDate ? ` – ${formatDate(item.endDate)}` : ""}</p>{item.note && <small>{item.note}</small>}{canReview && item.status === "PENDING" && <div className="request-actions"><button className="button button-primary" onClick={() => void onReview(item.id, "APPROVED")}><Check /> Approve</button><button className="button button-danger" onClick={() => void onReview(item.id, "REJECTED")}><X /> Reject</button></div>}</article>)}</div> : <div className="empty-state compact"><div className="empty-icon"><CalendarDays /></div><h3>No availability requests</h3><p>Requests that fall in the selected month appear here.</p></div>}</section></div>;
}

function ImportPage({ history, onHistory }: { history: WorkspaceImportBatch[]; onHistory: () => Promise<void> }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ batchId: string; rowCount: number; counts: Record<string, number>; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function previewFile() {
    if (!selectedFile) return;
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.set("file", selectedFile);
      const result = await fetchJson<{ batch: { id: string; rowCount: number }; preview: { counts: Record<string, number>; rowCount: number; errors: string[] } }>("/api/import", { method: "POST", body });
      setPreview({ batchId: result.batch.id, rowCount: result.preview.rowCount, counts: result.preview.counts, errors: result.preview.errors });
      await onHistory();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not read this workbook."); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const body = new FormData();
      if (!selectedFile) throw new Error("Re-select the validated file before applying the import.");
      body.set("file", selectedFile);
      await fetchJson(`/api/import/${preview.batchId}/commit`, { method: "POST", body });
      setMessage("Import applied. Existing records with matching external keys were updated; new source rows were added.");
      setPreview(null); setSelectedFile(null); await onHistory();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not apply import."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-columns"><section className="panel import-card"><div className="panel-header no-gutter"><div><h2>Import workforce data</h2><p>Upload your anonymized source workbook. Data stays in this app’s database.</p></div><FileSpreadsheet size={18} className="muted" /></div><div className="notice form-top-gap"><Shield /><span>Use pseudonymous employee labels if names are not required. The import validates references and dates first. No uploaded workbook or roster rows are added to Git.</span></div><div className="template-actions"><a className="button" href="/api/import/template"><ArrowDownToLine /> Excel workbook template</a><a className="button" href="/api/import/template?format=csv"><ArrowDownToLine /> Employees CSV template</a></div><label className="dropzone file-picker"><Upload /><h3>{selectedFile ? selectedFile.name : "Choose a CSV or Excel workbook"}</h3><p>Excel supports the complete roster data model · CSV supports employee rows for existing pods · 8 MB maximum</p><input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(""); }} /></label><div className="form-actions"><button className="button button-primary" type="button" disabled={!selectedFile || busy} onClick={() => void previewFile()}>{busy ? <LoaderCircle className="spin" /> : <FileSpreadsheet />} Validate workbook</button></div>{message && <div className={message.startsWith("Import applied") ? "form-success form-spaced" : "notice form-spaced"}>{message}</div>}{preview && <div className="import-preview"><div className="panel-header no-gutter"><div><h2>Import preview</h2><p>{preview.rowCount} data rows across workbook sheets</p></div><span className={`status-pill ${preview.errors.length ? "error" : "ok"}`}>{preview.errors.length ? `${preview.errors.length} issue${preview.errors.length === 1 ? "" : "s"}` : "Ready to apply"}</span></div><div className="import-summary">{Object.entries(preview.counts).filter(([, count]) => count > 0).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>{preview.errors.length > 0 && <ul className="error-list">{preview.errors.slice(0, 60).map((item, index) => <li key={index}>{item}</li>)}{preview.errors.length > 60 && <li>And {preview.errors.length - 60} more validation issues.</li>}</ul>}<div className="form-actions"><button type="button" className="button" onClick={() => setPreview(null)}>Discard preview</button><button type="button" className="button button-primary" disabled={busy || preview.errors.length > 0 || preview.rowCount === 0} onClick={() => void commit()}>{busy ? "Applying…" : "Apply import"}</button></div></div>}</section>
    <section className="panel"><div className="panel-header"><div><h2>Recent imports</h2><p>Private import history for this workspace</p></div><Database size={17} className="muted" /></div>{history.length ? <div className="import-history">{history.map((batch) => <div className="history-row" key={batch.id}><span className="history-icon"><FileSpreadsheet /></span><span className="history-meta"><strong>{batch.fileName}</strong><small>{batch.rowCount} rows · {batch.uploadedBy.displayName} · {formatDate(batch.createdAt.slice(0, 10))}</small></span><span className={`status-pill ${batch.committedAt ? "ok" : "warning"}`}>{batch.committedAt ? "Applied" : "Preview"}</span></div>)}</div> : <div className="empty-state compact"><div className="empty-icon"><Upload /></div><h3>No import history</h3><p>Validated import batches appear here.</p></div>}<div className="import-notes"><h3>Workbook sheets</h3><p>Pods · Employees · Brands · Processes · ProcessRules · Eligibility · Availability · Holidays</p><small>Identifiers should be stable across sheets. A repeat import updates records by externalKey and retains records omitted from the workbook.</small></div></section></div>;
}

type WorkspaceImportBatch = { id: string; fileName: string; rowCount: number; createdAt: string; committedAt: string | null; uploadedBy: { displayName: string } };

function AssistantPage({ month, aiReady }: { month: string; aiReady: boolean }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant" | "error"; text: string }>>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask(value = question) {
    const trimmed = value.trim(); if (!trimmed || busy) return;
    setQuestion(""); setMessages((current) => [...current, { role: "user", text: trimmed }]); setBusy(true);
    try {
      const result = await fetchJson<{ answer: string; provider: string }>("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, question: trimmed }) });
      setMessages((current) => [...current, { role: "assistant", text: result.answer }]);
    } catch (caught) { setMessages((current) => [...current, { role: "error", text: caught instanceof Error ? caught.message : "AI request failed." }]); }
    finally { setBusy(false); }
  }
  const suggestions = ["Explain the current coverage gaps.", "Which operating rules can create the most staffing pressure?", "Suggest a safe order for reviewing roster issues."];
  return <div className="workspace-columns assistant-columns"><section className="panel assistant-panel"><div className="assistant-intro"><span className="assistant-badge"><Sparkles /> PROCESS-LEVEL CONTEXT</span><h2>Roster planning assistant</h2><p>Ask about {month}. Coverage and process issues are summarized; known employee names and contact details are redacted before provider calls.</p></div>{!aiReady && <div className="notice warning ai-config-notice"><CircleHelp /><span>AI is not configured yet. Add <code>AI_BASE_URL</code>, <code>AI_MODEL</code>, and <code>AI_API_KEY</code> to the server environment. The key is never sent to the browser.</span></div>}{messages.length === 0 && <div className="suggestion-list"><span className="muted">Try asking</span>{suggestions.map((item) => <button key={item} type="button" className="suggestion-button" disabled={!aiReady || busy} onClick={() => void ask(item)}>{item}<ArrowRight size={12} /></button>)}</div>}<div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}>{message.text}</div>)}{busy && <div className="chat-message"><LoaderCircle className="spin" /> Reviewing the current planning summary…</div>}</div><form className="chat-input-row" onSubmit={(event) => { event.preventDefault(); void ask(); }}><label htmlFor="assistant-question" className="sr-only">Question for the roster assistant</label><textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1800} placeholder={aiReady ? "Ask about coverage, conflicts, or review steps…" : "Configure an AI provider to ask a question"} disabled={!aiReady || busy} /><button className="chat-send" type="submit" aria-label="Send question" disabled={!aiReady || busy || !question.trim()}><Send /></button></form></section><aside className="panel ai-side-panel"><div className="ai-side-icon"><Bot /></div><h2>How AI is used</h2><ul><li>It summarizes process-level conflicts and coverage totals.</li><li>It suggests human review steps for managers.</li><li>It never assigns employees or publishes a roster.</li><li>Scheduling rules and validation remain deterministic.</li></ul><div className="notice"><Shield /><span>Known employee names, email addresses, and phone numbers are redacted before provider calls. Keep API credentials on the server and never paste keys into chat.</span></div></aside></div>;
}

function AccessPage({ users, employees, pods, onCreated }: { users: AccessUser[]; employees: Overview["employees"]; pods: Overview["pods"]; onCreated: (user: AccessUser) => void }) {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", role: "EMPLOYEE" as Role, employeeId: "", managedPodId: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const created = await fetchJson<{ user: AccessUser }>("/api/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, employeeId: form.role === "EMPLOYEE" ? form.employeeId : undefined, managedPodId: form.role === "POD_LEAD" ? form.managedPodId : undefined }) });
      onCreated(created.user); setForm({ displayName: "", email: "", password: "", role: "EMPLOYEE", employeeId: "", managedPodId: "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create account."); }
    finally { setBusy(false); }
  }
  return <div className="section-stack"><section className="panel import-card"><div className="panel-header no-gutter"><div><h2>Create a workspace account</h2><p>Passwords require at least 12 characters. Employee accounts link to one roster record.</p></div><Shield size={18} className="muted" /></div>{error && <div className="form-error form-spaced">{error}</div>}<form className="access-form form-top-gap" onSubmit={(event) => void submit(event)}><div className="form-field"><label htmlFor="access-name">Display name</label><input id="access-name" className="form-input" required minLength={2} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></div><div className="form-field"><label htmlFor="access-email">Email</label><input id="access-email" className="form-input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div className="form-field"><label htmlFor="access-role">Role</label><select id="access-role" className="form-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role, employeeId: "", managedPodId: "" })}>{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="form-field"><label htmlFor="access-password">Temporary password</label><input id="access-password" className="form-input" type="password" minLength={12} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Share the temporary password securely.</small></div>{form.role === "EMPLOYEE" && <div className="form-field full-span"><label htmlFor="access-employee">Linked employee record</label><select id="access-employee" className="form-select" required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Select employee</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.podName}</option>)}</select></div>}{form.role === "POD_LEAD" && <div className="form-field full-span"><label htmlFor="access-pod">Managed pod</label><select id="access-pod" className="form-select" required value={form.managedPodId} onChange={(event) => setForm({ ...form, managedPodId: event.target.value })}><option value="">Select pod</option>{pods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}<div className="form-actions full-span"><button className="button button-primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button></div></form></section>
    <section className="panel"><div className="panel-header"><div><h2>Workspace accounts</h2><p>{users.length} account{users.length === 1 ? "" : "s"} with role-based access</p></div><Users size={17} className="muted" /></div><div className="table-wrap"><table className="access-table"><thead><tr><th>ACCOUNT</th><th>ROLE</th><th>SCOPE</th><th>STATUS</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.displayName}</strong><br /><span className="muted">{item.email}</span></td><td>{roleNames[item.role]}</td><td>{item.employeeId ? employees.find((employee) => employee.id === item.employeeId)?.name ?? "Employee" : item.managedPodId ? pods.find((pod) => pod.id === item.managedPodId)?.name ?? "Pod" : "Workspace"}</td><td><span className={`status-pill ${item.isActive ? "ok" : "neutral"}`}>{item.isActive ? "Active" : "Disabled"}</span></td></tr>)}</tbody></table></div></section></div>;
}

function formatDate(date: string) { return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`)); }
