(() => {
  "use strict";

  const STORAGE_KEY = "rosterly-workspace-v1";
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
  const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const state = loadState();
  let selectedMonth = currentMonthKey();
  let selectedDate = "";
  let currentView = "overview";
  let currentDirectory = "employees";
  let currentRecord = null;
  let currentAssignmentEdit = null;
  let toastTimer = null;
  const validationCache = { issues: [] };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function currentMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
  function monthTitle(monthKey, style = "long") {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { month: style, year: "numeric" }).format(new Date(year, month - 1, 1));
  }
  function makeDate(monthKey, day) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function daysInMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  }
  function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase(); }
  function byId(list, id) { return list.find((item) => item.id === id); }
  function employeeName(id) { return byId(state.employees, id)?.name || "Unknown employee"; }
  function brandName(id) { return byId(state.brands, id)?.name || "Unknown brand"; }
  function processName(id) { return byId(state.processes, id)?.name || "Unknown process"; }
  function podName(id) { return byId(state.pods, id)?.name || "Unassigned"; }
  function employeePod(employeeId) { return byId(state.employees, employeeId)?.podId || ""; }
  function getEmployeeAssignments(employeeId) { return state.assignments.filter((item) => item.employeeId === employeeId); }
  function getBrandAssignments(brandId) { return state.assignments.filter((item) => item.brandId === brandId); }
  function getProcessAssignments(processId) { return state.assignments.filter((item) => item.processId === processId); }
  function getBrandProcesses(brandId) { return state.processes.filter((item) => item.brandId === brandId); }
  function isAssigned(employeeId, processId) { return state.assignments.some((item) => item.employeeId === employeeId && item.processId === processId); }
  function holidayFor(date) { return state.holidays.find((holiday) => holiday.date === date); }
  function hasApprovedLeave(employeeId, date) { return state.leaves.some((leave) => leave.employeeId === employeeId && leave.date === date && leave.approved !== false); }
  function isProcessOperating(process, date) {
    if (!process || !process.operatingDays.includes(date.getDay())) return false;
    return !(process.holidayMode === "off" && holidayFor(dateKey(date)));
  }
  function minimumFor(process, date) {
    const override = Number(process?.dayMinimums?.[date.getDay()]);
    return Number.isFinite(override) && override > 0 ? override : Math.max(1, Number(process?.minStaff) || 1);
  }
  function recordChange(title, detail = "") {
    state.changeLog.unshift({ id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, detail, at: new Date().toISOString() });
    state.changeLog = state.changeLog.slice(0, 30);
  }
  function touchState() { state.version = (Number(state.version) || 1) + 1; }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const label = document.getElementById("save-state-text");
      if (label) label.textContent = "All changes saved";
    } catch (error) {
      const label = document.getElementById("save-state-text");
      if (label) label.textContent = "Unable to save locally";
    }
  }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.employees) && Array.isArray(saved.processes)) return normalizeState(saved);
    } catch (error) { /* Start with the included sample workspace if saved data is invalid. */ }
    return normalizeState(clone(window.SAMPLE_DATA));
  }
  function normalizeState(data) {
    data.pods ||= [];
    data.employees ||= [];
    data.brands ||= [];
    data.processes ||= [];
    data.assignments ||= [];
    data.holidays ||= [];
    data.leaves ||= [];
    data.changeLog ||= [];
    data.roster ||= { month: "", generatedAt: "", plan: {} };
    data.roster.plan ||= {};
    data.version ||= 1;
    data.scenario ||= null;
    for (const employee of data.employees) {
      employee.weeklyOff = Math.max(0, Math.min(6, Number.parseInt(employee.weeklyOff, 10) || 0));
      employee.title ||= "Operations associate";
    }
    for (const process of data.processes) {
      process.operatingDays = Array.isArray(process.operatingDays) ? [...new Set(process.operatingDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : [1, 2, 3, 4, 5, 6];
      process.holidayMode = process.holidayMode === "operate" ? "operate" : "off";
      process.minStaff = Math.max(1, Math.min(20, Number(process.minStaff) || 1));
      const dayMinimums = {};
      for (const [day, minimum] of Object.entries(process.dayMinimums || {})) {
        const dayNumber = Number(day); const minNumber = Number(minimum);
        if (Number.isInteger(dayNumber) && dayNumber >= 0 && dayNumber <= 6 && Number.isFinite(minNumber) && minNumber > 0) dayMinimums[dayNumber] = Math.min(20, minNumber);
      }
      process.dayMinimums = dayMinimums;
    }
    return data;
  }

  function showToast(message, warning = false) {
    const region = document.getElementById("toast-region");
    region.innerHTML = `<div class="toast${warning ? " warning" : ""}">${escapeHtml(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { region.innerHTML = ""; }, 3100);
  }
  function navigate(view) {
    currentView = view;
    document.querySelectorAll(".page-view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
    document.querySelectorAll(".nav-item").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
    document.getElementById("breadcrumb-current").textContent = ({ overview: "Overview", roster: "Roster planner", directory: "Team & brands", rules: "Coverage rules", issues: "Issues & changes" })[view] || "Overview";
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function generateRoster(userInitiated = true) {
    const count = daysInMonth(selectedMonth);
    const plan = {};
    const monthlyLoad = new Map(state.employees.map((employee) => [employee.id, 0]));
    const allAssignments = new Map();
    for (const item of state.assignments) {
      if (!allAssignments.has(item.processId)) allAssignments.set(item.processId, []);
      allAssignments.get(item.processId).push(item.employeeId);
    }

    for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
      const date = makeDate(selectedMonth, dayNumber);
      const dateString = dateKey(date);
      plan[dateString] = {};
      const busyBrands = new Map();
      const todayTasks = state.processes
        .filter((process) => isProcessOperating(process, date))
        .map((process) => ({ process, candidateCount: (allAssignments.get(process.id) || []).filter((id) => byId(state.employees, id) && !hasApprovedLeave(id, dateString)).length }))
        .sort((a, b) => a.candidateCount - b.candidateCount || a.process.name.localeCompare(b.process.name));

      for (const { process } of todayTasks) {
        const rawCandidates = [...new Set(allAssignments.get(process.id) || [])]
          .filter((id) => byId(state.employees, id) && !hasApprovedLeave(id, dateString));
        const chosen = [];
        for (let slot = 0; slot < minimumFor(process, date); slot += 1) {
          const candidates = rawCandidates.filter((id) => !chosen.includes(id) && (!busyBrands.has(id) || busyBrands.get(id) === process.brandId));
          candidates.sort((leftId, rightId) => {
            const left = byId(state.employees, leftId);
            const right = byId(state.employees, rightId);
            const leftOffPenalty = left.weeklyOff === date.getDay() ? 90 : 0;
            const rightOffPenalty = right.weeklyOff === date.getDay() ? 90 : 0;
            const leftLoad = monthlyLoad.get(leftId) || 0;
            const rightLoad = monthlyLoad.get(rightId) || 0;
            const leftBrandPenalty = busyBrands.has(leftId) ? 6 : 0;
            const rightBrandPenalty = busyBrands.has(rightId) ? 6 : 0;
            return leftOffPenalty + leftLoad + leftBrandPenalty - rightOffPenalty - rightLoad - rightBrandPenalty || left.name.localeCompare(right.name);
          });
          const selectedEmployeeId = candidates[0];
          if (!selectedEmployeeId) break;
          chosen.push(selectedEmployeeId);
          busyBrands.set(selectedEmployeeId, process.brandId);
          monthlyLoad.set(selectedEmployeeId, (monthlyLoad.get(selectedEmployeeId) || 0) + 1);
        }
        plan[dateString][process.id] = chosen;
      }
    }

    state.roster = { month: selectedMonth, generatedAt: new Date().toISOString(), sourceVersion: state.version, plan };
    if (userInitiated) recordChange("Monthly roster generated", `${monthTitle(selectedMonth)} schedule rebuilt from current availability and coverage rules.`);
    persist();
    refreshValidation();
    renderAll();
    if (userInitiated) showToast("Roster generated and checked against current rules.");
  }

  function evaluateProcessDate(process, dateString, plan = state.roster.plan) {
    const date = new Date(`${dateString}T12:00:00`);
    const required = isProcessOperating(process, date);
    const scheduledIds = [...new Set((plan?.[dateString]?.[process.id] || []).filter((id) => Boolean(byId(state.employees, id))))];
    const wrongAssignmentIds = scheduledIds.filter((id) => !isAssigned(id, process.id));
    const onLeaveIds = scheduledIds.filter((id) => hasApprovedLeave(id, dateString));
    const coveredIds = scheduledIds.filter((id) => isAssigned(id, process.id) && !hasApprovedLeave(id, dateString));
    const minimum = required ? minimumFor(process, date) : 0;
    return { required, minimum, scheduledIds, wrongAssignmentIds, onLeaveIds, coveredIds, missing: required ? Math.max(0, minimum - coveredIds.length) : 0 };
  }
  function suggestBackupEmployee(process, dateString) {
    const currentAssignees = new Set(getProcessAssignments(process.id).map((item) => item.employeeId));
    const date = new Date(`${dateString}T12:00:00`);
    const candidates = [...new Set(getBrandAssignments(process.brandId).map((item) => item.employeeId))]
      .filter((employeeId) => !currentAssignees.has(employeeId) && byId(state.employees, employeeId) && !hasApprovedLeave(employeeId, dateString))
      .filter((employeeId) => !Object.entries(state.roster.plan?.[dateString] || {}).some(([processId, ids]) => ids.includes(employeeId) && byId(state.processes, processId)?.brandId !== process.brandId));
    candidates.sort((leftId, rightId) => {
      const left = byId(state.employees, leftId); const right = byId(state.employees, rightId);
      return Number(left.weeklyOff === date.getDay()) - Number(right.weeklyOff === date.getDay()) || left.name.localeCompare(right.name);
    });
    return candidates[0] || "";
  }
  function validateRoster() {
    const issues = [];
    if (!state.roster?.month || state.roster.month !== selectedMonth || !state.roster.plan) {
      issues.push({ id: "no-roster", level: "info", type: "empty", title: "No roster generated for this month", detail: `Generate a ${monthTitle(selectedMonth)} plan to see coverage findings.` });
      return issues;
    }
    const count = daysInMonth(state.roster.month);
    const assignmentsByDateEmployee = new Map();
    const weeklyOffKeys = new Set();

    for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
      const date = makeDate(state.roster.month, dayNumber);
      const dateString = dateKey(date);
      for (const process of state.processes) {
        const result = evaluateProcessDate(process, dateString);
        if (result.wrongAssignmentIds.length) {
          issues.push({ id: `invalid-${process.id}-${dateString}`, level: "error", type: "invalid", date: dateString, processId: process.id, brandId: process.brandId, title: `${process.name} has an employee without this assignment`, detail: `Update the staffing selection for ${brandName(process.brandId)} or add a valid assignment.` });
        }
        if (result.onLeaveIds.length) {
          issues.push({ id: `leave-${process.id}-${dateString}`, level: "error", type: "leave", date: dateString, processId: process.id, brandId: process.brandId, title: `${employeeName(result.onLeaveIds[0])} is scheduled during approved time off`, detail: `${brandName(process.brandId)} · ${process.name} needs a replacement on ${formatDate(dateString, { weekday: "short", month: "short", day: "numeric" })}.` });
        }
        if (result.required && result.missing > 0) {
          const availableCount = state.assignments.filter((item) => item.processId === process.id && !hasApprovedLeave(item.employeeId, dateString)).length;
          let reason = availableCount === 0 ? "No assigned employee is available." : "Available employees are assigned to other brands or the process needs more staff.";
          if (result.scheduledIds.length > 0 && result.onLeaveIds.length === result.scheduledIds.length) reason = "All scheduled employees are on approved leave.";
          const backupId = suggestBackupEmployee(process, dateString);
          if (backupId) reason += ` ${employeeName(backupId)} is an available teammate on this brand; consider adding them to this process as a backup.`;
          issues.push({ id: `gap-${process.id}-${dateString}`, level: "error", type: "gap", date: dateString, processId: process.id, brandId: process.brandId, title: `${brandName(process.brandId)} · ${process.name} is short by ${result.missing}`, detail: `${reason} Add a trained backup, then regenerate and validate the roster.`, missing: result.missing });
        }
        if (!result.required && result.scheduledIds.length) {
          issues.push({ id: `closed-${process.id}-${dateString}`, level: "warning", type: "closed", date: dateString, processId: process.id, brandId: process.brandId, title: `${process.name} is staffed on a non-operating day`, detail: `${brandName(process.brandId)} is closed for this process on ${formatDate(dateString, { weekday: "short", month: "short", day: "numeric" })}.` });
        }
        for (const employeeId of result.scheduledIds) {
          const key = `${dateString}|${employeeId}`;
          if (!assignmentsByDateEmployee.has(key)) assignmentsByDateEmployee.set(key, new Set());
          assignmentsByDateEmployee.get(key).add(process.brandId);
          const employee = byId(state.employees, employeeId);
          if (employee && employee.weeklyOff === date.getDay()) weeklyOffKeys.add(`${dateString}|${employeeId}`);
        }
      }
    }

    for (const [key, brandIds] of assignmentsByDateEmployee.entries()) {
      if (brandIds.size > 1) {
        const [dateString, employeeId] = key.split("|");
        const brandsText = [...brandIds].map(brandName).join(" and ");
        issues.push({ id: `overlap-${key}`, level: "error", type: "overlap", date: dateString, title: `${employeeName(employeeId)} is scheduled across overlapping brands`, detail: `Cross-brand responsibilities overlap: ${brandsText}. Keep one brand per employee per day.` });
      }
      if (weeklyOffKeys.has(key)) {
        const [dateString, employeeId] = key.split("|");
        const employee = byId(state.employees, employeeId);
        issues.push({ id: `weekly-${key}`, level: "warning", type: "weekly", date: dateString, title: `${employeeName(employeeId)} is working on their preferred day off`, detail: `Required coverage took priority over ${DAYS_LONG[employee.weeklyOff]} rest-day preference. Review if a swap is possible.` });
      }
    }
    return issues;
  }
  function refreshValidation() { validationCache.issues = validateRoster(); }
  function getDayCoverage(dateString, mode = "company", scope = "") {
    const date = new Date(`${dateString}T12:00:00`);
    let processes = state.processes.filter((process) => isProcessOperating(process, date));
    if (mode === "brand" && scope) processes = processes.filter((process) => process.brandId === scope);
    if (mode === "process" && scope) processes = processes.filter((process) => process.id === scope);
    if (mode === "pod" && scope) processes = processes.filter((process) => getProcessAssignments(process.id).some((assignment) => employeePod(assignment.employeeId) === scope));
    if (mode === "employee" && scope) processes = processes.filter((process) => isAssigned(scope, process.id));
    const required = processes.reduce((total, process) => total + minimumFor(process, date), 0);
    const staffed = processes.reduce((total, process) => total + Math.min(minimumFor(process, date), evaluateProcessDate(process, dateString).coveredIds.length), 0);
    return { required, staffed, processes, percent: required ? Math.round((staffed / required) * 100) : 100 };
  }
  function getDayRows(dateString, mode = "company", scope = "") {
    const date = new Date(`${dateString}T12:00:00`);
    let processes = state.processes.filter((process) => isProcessOperating(process, date));
    if (mode === "brand" && scope) processes = processes.filter((process) => process.brandId === scope);
    if (mode === "process" && scope) processes = processes.filter((process) => process.id === scope);
    if (mode === "pod" && scope) processes = processes.filter((process) => getProcessAssignments(process.id).some((assignment) => employeePod(assignment.employeeId) === scope));
    if (mode === "employee" && scope) processes = processes.filter((process) => isAssigned(scope, process.id));
    return processes.map((process) => ({ process, result: evaluateProcessDate(process, dateString) }));
  }
  function getEmployeeDayStatus(employeeId, dateString) {
    const employee = byId(state.employees, employeeId);
    if (!employee) return { label: "Employee unavailable", kind: "off", required: 0, staffed: 0 };
    const leave = state.leaves.find((item) => item.employeeId === employeeId && item.date === dateString && item.approved !== false);
    if (leave) return { label: leave.kind === "comp-off" ? "Comp-off" : "Approved leave", kind: "warn", required: 1, staffed: 0 };
    const activeAssignments = state.assignments.filter((item) => item.employeeId === employeeId).filter((item) => isProcessOperating(byId(state.processes, item.processId), new Date(`${dateString}T12:00:00`)));
    if (!activeAssignments.length) return { label: holidayFor(dateString) ? "Holiday" : "No work required", kind: "off", required: 0, staffed: 0 };
    const scheduled = activeAssignments.some((item) => (state.roster.plan?.[dateString]?.[item.processId] || []).includes(employeeId));
    if (scheduled) return { label: "Working", kind: "good", required: 1, staffed: 1 };
    if (employee.weeklyOff === new Date(`${dateString}T12:00:00`).getDay()) return { label: "Preferred rest day", kind: "off", required: 0, staffed: 0 };
    return { label: "Rotation / backup day", kind: "off", required: 0, staffed: 0 };
  }
  function activeRosterScope() {
    const mode = document.getElementById("view-mode")?.value || "company";
    const scope = document.getElementById("view-scope")?.value || "";
    return { mode, scope };
  }
  function formatDate(dateString, options = { weekday: "long", month: "long", day: "numeric" }) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("en", options).format(new Date(year, month - 1, day));
  }
  function renderAll() {
    if (!selectedDate || selectedDate.slice(0, 7) !== selectedMonth) {
      const today = new Date();
      selectedDate = dateKey(makeDate(selectedMonth, selectedMonth === currentMonthKey() ? today.getDate() : 1));
    }
    const overviewMonth = document.getElementById("overview-month");
    const rosterMonth = document.getElementById("roster-month");
    if (overviewMonth) overviewMonth.value = selectedMonth;
    if (rosterMonth) rosterMonth.value = selectedMonth;
    refreshValidation();
    renderOverview();
    renderRoster();
    renderDirectory();
    renderRules();
    renderIssues();
  }

  function renderOverview() {
    const metricRoot = document.getElementById("metric-grid");
    const rosterReady = state.roster.month === selectedMonth;
    const count = daysInMonth(selectedMonth);
    let totalRequired = 0;
    let totalStaffed = 0;
    const daily = [];
    for (let day = 1; day <= count; day += 1) {
      const dateString = dateKey(makeDate(selectedMonth, day));
      const summary = getDayCoverage(dateString);
      totalRequired += summary.required;
      totalStaffed += summary.staffed;
      daily.push({ dateString, ...summary });
    }
    const coverage = totalRequired ? Math.round((totalStaffed / totalRequired) * 100) : 100;
    const errors = validationCache.issues.filter((issue) => issue.level === "error").length;
    const warningCount = validationCache.issues.filter((issue) => issue.level === "warning").length;
    document.getElementById("today-label").textContent = monthTitle(selectedMonth).toUpperCase();
    metricRoot.innerHTML = [
      metricCard("Active employees", state.employees.length, `${state.pods.length} operational pods`, "♧", `${state.employees.length >= 30 ? "30+" : "Team"} capacity`),
      metricCard("Client brands", state.brands.length, `${state.processes.length} configured processes`, "◇", "Multi-brand coverage"),
      metricCard("Required coverage", rosterReady ? `${coverage}%` : "—", rosterReady ? `${totalStaffed.toLocaleString()} of ${totalRequired.toLocaleString()} positions planned` : "Generate a plan to calculate", "◷", rosterReady ? "Monthly plan" : "Awaiting plan"),
      metricCard("Items to review", errors + warningCount, errors ? `${errors} coverage ${errors === 1 ? "gap" : "gaps"} · ${warningCount} warnings` : warningCount ? `${warningCount} soft-rule warnings` : "No open conflicts", "△", errors ? "Action needed" : "On track", errors > 0),
    ].join("");
    renderCoverageChart(daily);
    renderAttentionItems();
    renderSnapshot();
    renderPodHealth();
  }
  function metricCard(label, value, foot, icon, note, warning = false) {
    return `<div class="metric-card"><div class="metric-top"><span>${escapeHtml(label)}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-foot"><span class="${warning ? "warning-text" : "positive"}">${escapeHtml(note)}</span><span>·</span><span>${escapeHtml(foot)}</span></div></div>`;
  }
  function renderCoverageChart(daily) {
    const root = document.getElementById("coverage-visual");
    root.innerHTML = daily.map((item, index) => {
      const barHeight = item.required ? Math.max(4, item.percent * .75) : 2;
      const cls = !item.required ? "none" : item.percent === 100 ? "" : "partial";
      const tick = index === 0 || (index + 1) % 7 === 0 || index === daily.length - 1 ? `<span class="coverage-tick">${index + 1}</span>` : "";
      return `<div class="coverage-bar-wrap" title="${escapeHtml(formatDate(item.dateString, { weekday: "short", month: "short", day: "numeric" }))}: ${item.required ? `${item.percent}% covered` : "no coverage required"}"><span class="coverage-bar ${cls}" style="height:${barHeight}%"></span>${tick}</div>`;
    }).join("");
  }
  function renderAttentionItems() {
    const root = document.getElementById("attention-list");
    const issues = validationCache.issues.filter((issue) => issue.level === "error").slice(0, 3);
    document.getElementById("priority-count").textContent = validationCache.issues.filter((issue) => issue.level === "error").length;
    if (!issues.length) {
      const warnings = validationCache.issues.filter((issue) => issue.level === "warning").slice(0, 2);
      if (!warnings.length) {
        root.innerHTML = `<div class="attention-row"><span class="attention-icon" style="background:#edf6ed;color:#53845d">✓</span><span><strong>Coverage is looking good</strong><small>Required client processes have assigned staff.</small></span></div>`;
      } else {
        root.innerHTML = warnings.map((issue) => `<button class="attention-row" data-issue="${escapeHtml(issue.id)}"><span class="attention-icon">!</span><span><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.detail)}</small></span></button>`).join("");
      }
    } else {
      root.innerHTML = issues.map((issue) => `<button class="attention-row" data-issue="${escapeHtml(issue.id)}"><span class="attention-icon">!</span><span><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.date ? formatDate(issue.date, { month: "short", day: "numeric" }) : "Review the roster")}</small></span></button>`).join("");
    }
  }
  function renderSnapshot() {
    let dateString = currentMonthKey() === selectedMonth ? dateKey(new Date()) : selectedDate;
    if (dateString.slice(0, 7) !== selectedMonth) dateString = `${selectedMonth}-01`;
    document.getElementById("snapshot-date").textContent = formatDate(dateString, { weekday: "long", month: "long", day: "numeric" });
    const summary = getDayCoverage(dateString);
    const active = summary.processes.slice(0, 3);
    const rows = active.map((process) => {
      const result = evaluateProcessDate(process, dateString);
      return `<div class="snapshot-row"><i class="snapshot-color${result.missing ? " amber" : ""}"></i><span class="snapshot-info"><strong>${escapeHtml(brandName(process.brandId))}</strong><small>${escapeHtml(process.name)}</small></span><span class="snapshot-count">${result.coveredIds.length}/${result.minimum}</span></div>`;
    }).join("");
    document.getElementById("snapshot-content").innerHTML = rows || `<div class="empty-state">No client processes are scheduled for this date.</div>`;
  }
  function renderPodHealth() {
    const root = document.getElementById("pod-list");
    const max = Math.max(1, ...state.pods.map((pod) => state.employees.filter((employee) => employee.podId === pod.id).length));
    root.innerHTML = state.pods.slice(0, 7).map((pod) => {
      const employees = state.employees.filter((employee) => employee.podId === pod.id).length;
      return `<div class="pod-row"><span class="pod-name">${escapeHtml(pod.name)}</span><span class="pod-meter"><i style="width:${Math.round(employees / max * 100)}%"></i></span><span class="pod-count">${employees} ppl</span></div>`;
    }).join("") || `<div class="empty-state">Add pods to organise the team.</div>`;
    document.getElementById("pod-count-label").textContent = `${state.pods.length} ${state.pods.length === 1 ? "pod" : "pods"}`;
  }

  function ensureScopeOptions() {
    const modeControl = document.getElementById("view-mode");
    const scopeControl = document.getElementById("view-scope");
    if (!modeControl || !scopeControl) return;
    const mode = modeControl.value;
    const options = mode === "pod" ? state.pods.map((item) => [item.id, item.name])
      : mode === "brand" ? state.brands.map((item) => [item.id, item.name])
        : mode === "process" ? state.processes.map((item) => [item.id, `${brandName(item.brandId)} · ${item.name}`])
          : mode === "employee" ? state.employees.map((item) => [item.id, item.name]) : [];
    if (!options.length) {
      scopeControl.hidden = true;
      scopeControl.innerHTML = "";
      return;
    }
    const previous = scopeControl.value;
    scopeControl.hidden = false;
    scopeControl.innerHTML = options.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join("");
    if (options.some(([id]) => id === previous)) scopeControl.value = previous;
  }
  function renderRoster() {
    ensureScopeOptions();
    const { mode, scope } = activeRosterScope();
    const rosterReady = state.roster.month === selectedMonth && state.roster.plan;
    const grid = document.getElementById("calendar-grid");
    const start = makeDate(selectedMonth, 1);
    const mondayOffset = (start.getDay() + 6) % 7;
    const gridStart = new Date(start.getFullYear(), start.getMonth(), 1 - mondayOffset);
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const dateString = dateKey(date);
      const inMonth = date.getMonth() === start.getMonth();
      const holiday = holidayFor(dateString);
      let summary = inMonth && rosterReady ? getDayCoverage(dateString, mode, scope) : { required: 0, staffed: 0, percent: 100 };
      const employeeStatus = inMonth && rosterReady && mode === "employee" && scope ? getEmployeeDayStatus(scope, dateString) : null;
      if (employeeStatus) summary = { ...summary, required: employeeStatus.required, staffed: employeeStatus.staffed, percent: employeeStatus.required ? employeeStatus.staffed * 100 : 100 };
      const selected = dateString === selectedDate;
      const today = dateString === dateKey(new Date());
      const status = summary.required && summary.percent < 100 ? "partial" : "";
      const off = !summary.required || !inMonth;
      const employeeCoverage = employeeStatus ? `<span class="day-coverage"><span>${escapeHtml(employeeStatus.label)}</span><strong class="${employeeStatus.kind === "warn" ? "partial" : ""}">${employeeStatus.kind === "good" ? "✓" : employeeStatus.kind === "warn" ? "!" : "—"}</strong></span>${employeeStatus.kind !== "off" ? `<span class="day-progress"><i class="${employeeStatus.kind === "warn" ? "partial" : ""}" style="width:${employeeStatus.kind === "good" ? 100 : 0}%"></i></span>` : ""}` : "";
      const coverageHtml = employeeStatus ? employeeCoverage : summary.required ? `<span class="day-coverage"><span>${summary.staffed} of ${summary.required} covered</span><strong class="${status}">${summary.percent}%</strong></span><span class="day-progress"><i class="${status}" style="width:${summary.percent}%"></i></span>` : `<span class="day-coverage"><span>${holiday ? "Holiday" : "No coverage"}</span><strong>Off</strong></span>`;
      cells.push(`<button class="calendar-day${inMonth ? "" : " outside-month"}${selected ? " selected" : ""}${off ? " non-operating-day" : ""}" data-select-date="${dateString}" aria-label="${escapeHtml(formatDate(dateString))}${employeeStatus ? `, ${employeeStatus.label}` : inMonth && rosterReady ? `, ${summary.percent}% coverage` : ""}"><span class="day-head"><span class="day-number">${date.getDate()}${today ? "<i class=day-today></i>" : ""}</span>${summary.required ? `<span class="status-chip ${summary.percent === 100 ? "status-good" : "status-warn"}">${summary.percent === 100 ? "✓" : "!"}</span>` : ""}</span>${holiday && inMonth ? `<span class="day-holiday">${escapeHtml(holiday.name)}</span>` : ""}${rosterReady && inMonth ? coverageHtml : ""}</button>`);
    }
    if (!rosterReady) grid.innerHTML = `<div class="calendar-empty"><div><strong>No plan for ${escapeHtml(monthTitle(selectedMonth))}</strong><br />Generate a roster to review day-by-day coverage.</div></div>`;
    else grid.innerHTML = cells.join("");
    const updatedLabel = document.getElementById("roster-updated-label");
    if (!rosterReady) updatedLabel.textContent = "No plan generated";
    else if (state.roster.sourceVersion !== state.version) updatedLabel.innerHTML = `<span style="color:#b47b3b">Plan needs refresh</span>`;
    else updatedLabel.textContent = `Generated ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(state.roster.generatedAt))}`;
    renderDayPanel(rosterReady, mode, scope);
    renderDailyDetail(rosterReady, mode, scope);
  }
  function renderDayPanel(rosterReady, mode, scope) {
    const root = document.getElementById("day-panel");
    if (!rosterReady) {
      root.innerHTML = `<div class="day-panel-title"><div><p class="eyebrow">SELECTED DAY</p><h3>${escapeHtml(formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" }))}</h3></div></div><div class="empty-day">Generate the monthly plan to see who is assigned to each process.</div><button class="button button-primary" data-action="generate">Generate roster</button>`;
      return;
    }
    const summary = getDayCoverage(selectedDate, mode, scope);
    const rows = getDayRows(selectedDate, mode, scope);
    const date = new Date(`${selectedDate}T12:00:00`);
    const holiday = holidayFor(selectedDate);
    const employeeStatus = mode === "employee" && scope ? getEmployeeDayStatus(scope, selectedDate) : null;
    const label = mode === "company" ? "Company-wide" : mode === "pod" ? podName(scope) : mode === "brand" ? brandName(scope) : mode === "process" ? processName(scope) : employeeName(scope);
    const sampleRows = rows.slice(0, 5).map(({ process, result }) => {
      const selectedIds = result.coveredIds;
      const isGap = result.missing > 0;
      const first = selectedIds[0];
      return `<div class="staffing-item"><span class="staffing-avatar${isGap ? " gap" : ""}">${first ? escapeHtml(initials(employeeName(first))) : "!"}</span><span class="staffing-meta"><strong>${escapeHtml(brandName(process.brandId))}</strong><small>${escapeHtml(process.name)} · ${selectedIds.length}/${result.minimum}</small></span><span class="staffing-status${isGap ? " gap" : ""}">${isGap ? "Gap" : "Covered"}</span></div>`;
    }).join("");
    root.innerHTML = `<div class="day-panel-title"><div><p class="eyebrow">${escapeHtml(label.toUpperCase())}</p><h3>${escapeHtml(formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" }))}</h3><p>${escapeHtml(holiday?.name || "Daily coverage summary")}</p></div><span class="day-panel-date"><small>${DAYS_SHORT[date.getDay()]}</small>${date.getDate()}</span></div><div class="day-score"><div><strong>${summary.percent}%</strong><br /><span>${summary.staffed} of ${summary.required} positions filled</span></div><span class="day-score-badge${summary.percent < 100 ? " gap" : ""}">${summary.required ? (summary.percent === 100 ? "On track" : "Needs attention") : "No coverage due"}</span></div>${employeeStatus ? `<div class="employee-day-status ${employeeStatus.kind}"><span>${employeeStatus.kind === "good" ? "✓" : employeeStatus.kind === "warn" ? "!" : "—"}</span><strong>${escapeHtml(employeeName(scope))}</strong><small>${escapeHtml(employeeStatus.label)}</small></div>` : ""}<p class="panel-section-label">PROCESS COVERAGE${rows.length > 5 ? ` · TOP 5 OF ${rows.length}` : ""}</p>${sampleRows || `<div class="empty-day">No processes are scheduled for this day in the selected view.</div>`}<div class="panel-footer"><button class="button button-secondary" data-navigate="issues">View issues</button><button class="button button-secondary" data-action="validate">Validate day</button></div>`;
  }
  function renderDailyDetail(rosterReady, mode, scope) {
    const root = document.getElementById("daily-detail-card");
    if (!rosterReady) {
      root.innerHTML = `<div class="detail-heading"><div><p class="eyebrow">DAILY ASSIGNMENTS</p><h2>Selected day details</h2><p>Generate a roster to review process staffing.</p></div></div>`;
      return;
    }
    const rows = getDayRows(selectedDate, mode, scope);
    const date = new Date(`${selectedDate}T12:00:00`);
    const holiday = holidayFor(selectedDate);
    const label = mode === "company" ? "all pods and brands" : mode === "pod" ? `${podName(scope)} pod` : mode === "brand" ? brandName(scope) : mode === "process" ? processName(scope) : `${employeeName(scope)}'s assignments`;
    const body = rows.map(({ process, result }) => {
      const assigned = result.scheduledIds.filter((id) => isAssigned(id, process.id));
      const invalid = result.scheduledIds.filter((id) => !isAssigned(id, process.id));
      const names = assigned.map((id) => `<span class="employee-pill">${escapeHtml(employeeName(id))}</span>`).join("") || `<span style="color:#b57b3c;font-size:14px">Unfilled</span>`;
      const moreInvalid = invalid.map((id) => `<span class="employee-pill" style="background:#fff0ed;color:#a95b54">${escapeHtml(employeeName(id))} · invalid</span>`).join("");
      const gap = result.missing > 0 || invalid.length > 0 || result.onLeaveIds.length > 0;
      const coverageText = result.missing ? `${result.coveredIds.length}/${result.minimum} · gap ${result.missing}` : `${result.coveredIds.length}/${result.minimum} covered`;
      return `<tr><td><span class="table-main">${escapeHtml(brandName(process.brandId))}</span><span class="table-sub">${escapeHtml(podName(employeePod(assigned[0])) || "Client operations")}</span></td><td><span class="table-main">${escapeHtml(process.name)}</span><span class="table-sub">${process.holidayMode === "operate" ? "Runs on public holidays" : "Public holidays off"}</span></td><td><div class="employee-pills">${names}${moreInvalid}</div></td><td><span class="coverage-pill${gap ? " gap" : ""}">${escapeHtml(coverageText)}</span></td><td><button class="table-action" data-edit-coverage="${escapeHtml(process.id)}" data-edit-date="${escapeHtml(selectedDate)}">Edit team</button></td></tr>`;
    }).join("");
    root.innerHTML = `<div class="detail-heading"><div><p class="eyebrow">DAILY ASSIGNMENTS</p><h2>${escapeHtml(formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" }))}</h2><p>Showing ${escapeHtml(label)}${holiday ? ` · ${escapeHtml(holiday.name)}` : ""}. Click Edit team to make a manual change.</p></div><button class="button button-secondary" data-action="validate">✓ Validate changes</button></div>${rows.length ? `<div class="detail-table-wrap"><table class="data-table"><thead><tr><th>BRAND</th><th>PROCESS</th><th>PLANNED EMPLOYEES</th><th>COVERAGE</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="empty-state">No coverage is required for this day in the selected view.</div>`}`;
  }

  function renderDirectory() {
    document.getElementById("employee-tab-count").textContent = state.employees.length;
    document.getElementById("brand-tab-count").textContent = state.brands.length;
    document.getElementById("assignment-tab-count").textContent = state.assignments.length;
    document.getElementById("pod-tab-count").textContent = state.pods.length;
    const tabRoot = document.querySelector(".directory-tabs");
    tabRoot.querySelectorAll(".directory-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.directory === currentDirectory));
    const search = (document.getElementById("directory-search")?.value || "").trim().toLowerCase();
    const filter = document.getElementById("directory-filter");
    const previousFilter = filter.value;
    filter.innerHTML = `<option value="all">All pods</option>${state.pods.map((pod) => `<option value="${escapeHtml(pod.id)}">${escapeHtml(pod.name)}</option>`).join("")}`;
    if (state.pods.some((pod) => pod.id === previousFilter)) filter.value = previousFilter;
    const selectedPod = filter.value;
    const assignmentCount = state.assignments.length;
    const soloBrands = state.brands.filter((brand) => new Set(getBrandAssignments(brand.id).map((assignment) => assignment.employeeId)).size === 1).length;
    document.getElementById("directory-summary").innerHTML = `<div class="summary-block"><strong>${state.employees.length}</strong><span>Active employees</span></div><div class="summary-block"><strong>${state.brands.length}</strong><span>Client brands</span></div><div class="summary-block"><strong>${state.pods.length}</strong><span>Operational pods</span></div><div class="summary-block"><strong>${assignmentCount}</strong><span>Resource allocations · ${soloBrands} single-resource brands</span></div>`;
    const content = document.getElementById("directory-content");
    if (currentDirectory === "employees") {
      const filtered = state.employees.filter((employee) => (!selectedPod || selectedPod === "all" || employee.podId === selectedPod) && `${employee.name} ${podName(employee.podId)} ${employee.title}`.toLowerCase().includes(search));
      content.innerHTML = `<div class="card table-card"><div class="detail-table-wrap"><table class="data-table directory-table"><thead><tr><th>EMPLOYEE</th><th>POD</th><th>ASSIGNMENTS</th><th>PREFERRED DAY OFF</th><th>MONTH LOAD</th><th></th></tr></thead><tbody>${filtered.map((employee) => {
        const assigned = getEmployeeAssignments(employee.id);
        const brandCount = new Set(assigned.map((item) => item.brandId)).size;
        const restDay = DAYS_LONG[employee.weeklyOff];
        const monthlyJobs = state.roster.month === selectedMonth ? Object.entries(state.roster.plan).reduce((sum, [date, processMap]) => sum + Object.entries(processMap || {}).filter(([processId, ids]) => ids.includes(employee.id) && isProcessOperating(byId(state.processes, processId), new Date(`${date}T12:00:00`))).length, 0) : 0;
        return `<tr><td><span class="person-cell"><span class="avatar">${escapeHtml(initials(employee.name))}</span><span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.title)}</small></span></span></td><td><span class="pod-chip">${escapeHtml(podName(employee.podId))}</span></td><td><span class="table-main">${brandCount} ${brandCount === 1 ? "brand" : "brands"}</span><span class="table-sub">${assigned.length} process allocation${assigned.length === 1 ? "" : "s"}</span></td><td>${escapeHtml(restDay)}<span class="table-sub">Preferred weekly off</span></td><td><span class="soft-chip green">${monthlyJobs} process slots</span></td><td><div class="table-actions"><button data-edit-employee="${escapeHtml(employee.id)}">Edit</button><button data-add-leave="${escapeHtml(employee.id)}">Time off</button><button data-delete-employee="${escapeHtml(employee.id)}">Remove</button></div></td></tr>`;
      }).join("") || `<tr><td colspan="6"><div class="empty-state">No employees match this search.</div></td></tr>`}</tbody></table></div></div>`;
    } else if (currentDirectory === "brands") {
      const filtered = state.brands.filter((brand) => `${brand.name} ${brand.segment} ${getBrandProcesses(brand.id).map((process) => process.name).join(" ")}`.toLowerCase().includes(search));
      content.innerHTML = `<div class="brand-card-grid">${filtered.map((brand) => {
        const processes = getBrandProcesses(brand.id);
        const people = [...new Set(getBrandAssignments(brand.id).map((assignment) => assignment.employeeId))];
        return `<article class="brand-card"><div class="brand-card-head"><span class="brand-avatar">${escapeHtml(initials(brand.name))}</span><div style="flex:1"><strong>${escapeHtml(brand.name)}</strong><small>${escapeHtml(brand.segment || "Client brand")}</small></div><div class="brand-card-actions"><button data-edit-brand="${escapeHtml(brand.id)}">Edit</button><button data-delete-brand="${escapeHtml(brand.id)}">Remove</button></div></div><div class="brand-process-list">${processes.map((process) => `<span class="soft-chip">${escapeHtml(process.name)}</span>`).join("") || `<span class="soft-chip amber">No processes configured</span>`}</div><div class="brand-staff">${people.slice(0, 5).map((id) => `<span class="mini-avatar" title="${escapeHtml(employeeName(id))}">${escapeHtml(initials(employeeName(id)))}</span>`).join("")}<small>${people.length} ${people.length === 1 ? "resource" : "resources"}</small></div></article>`;
      }).join("")}${!filtered.length ? `<div class="empty-state">No brands match this search.</div>` : ""}</div>`;
    } else if (currentDirectory === "assignments") {
      const filtered = state.assignments.filter((item) => `${employeeName(item.employeeId)} ${brandName(item.brandId)} ${processName(item.processId)} ${podName(employeePod(item.employeeId))}`.toLowerCase().includes(search));
      content.innerHTML = `<div class="card table-card"><div class="detail-table-wrap"><table class="data-table directory-table"><thead><tr><th>EMPLOYEE</th><th>BRAND</th><th>PROCESS</th><th>POD</th><th></th></tr></thead><tbody>${filtered.map((item) => `<tr><td><span class="table-main">${escapeHtml(employeeName(item.employeeId))}</span></td><td>${escapeHtml(brandName(item.brandId))}</td><td><span class="soft-chip">${escapeHtml(processName(item.processId))}</span></td><td><span class="pod-chip">${escapeHtml(podName(employeePod(item.employeeId)))}</span></td><td><div class="table-actions"><button data-edit-assignment="${escapeHtml(item.id)}">Edit</button><button data-delete-assignment="${escapeHtml(item.id)}">Remove</button></div></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">No assignments match this search.</div></td></tr>`}</tbody></table></div></div>`;
    } else {
      const filtered = state.pods.filter((pod) => `${pod.name} ${pod.lead} ${state.employees.filter((employee) => employee.podId === pod.id).map((employee) => employee.name).join(" ")}`.toLowerCase().includes(search));
      content.innerHTML = `<div class="card table-card"><div class="detail-table-wrap"><table class="data-table directory-table"><thead><tr><th>POD</th><th>POD LEAD</th><th>TEAM SIZE</th><th>BRAND COVERAGE</th><th></th></tr></thead><tbody>${filtered.map((pod) => {
        const members = state.employees.filter((employee) => employee.podId === pod.id);
        const brands = new Set(members.flatMap((employee) => getEmployeeAssignments(employee.id).map((item) => item.brandId)));
        return `<tr><td><span class="table-main">${escapeHtml(pod.name)}</span></td><td>${escapeHtml(pod.lead)}</td><td>${members.length} employees</td><td>${brands.size} brands</td><td><div class="table-actions"><button data-edit-pod="${escapeHtml(pod.id)}">Edit</button><button data-delete-pod="${escapeHtml(pod.id)}">Remove</button></div></td></tr>`;
      }).join("") || `<tr><td colspan="5"><div class="empty-state">No pods match this search.</div></td></tr>`}</tbody></table></div></div>`;
    }
    const searchBox = document.querySelector(".search-box");
    document.querySelector(".directory-toolbar .heading-actions");
    let addButton = document.getElementById("directory-add-button");
    if (!addButton) {
      addButton = document.createElement("button");
      addButton.id = "directory-add-button";
      addButton.className = "button button-secondary";
      document.querySelector(".directory-toolbar").appendChild(addButton);
    }
    addButton.textContent = currentDirectory === "brands" ? "＋ Add brand" : currentDirectory === "assignments" ? "＋ Assignment" : currentDirectory === "pods" ? "＋ Add pod" : "＋ Add employee";
    addButton.onclick = () => currentDirectory === "brands" ? openBrandDialog() : currentDirectory === "assignments" ? openAssignmentDialog() : currentDirectory === "pods" ? openPodDialog() : openEmployeeDialog();
    if (currentDirectory !== "employees") filter.hidden = true;
    else filter.hidden = false;
  }

  function renderRules() {
    const activeDays = state.processes.filter((process) => process.operatingDays.length === 7).length;
    const shared = state.processes.filter((process) => new Set(getProcessAssignments(process.id).map((item) => item.employeeId)).size > 1).length;
    document.getElementById("rule-summary").innerHTML = `<div class="summary-block"><strong>${state.processes.length}</strong><span>Process calendars</span></div><div class="summary-block"><strong>${activeDays}</strong><span>Seven-day operations</span></div><div class="summary-block"><strong>${shared}</strong><span>Shared-resource processes</span></div><div class="summary-block"><strong>${state.holidays.length}</strong><span>Public holidays configured</span></div>`;
    const rows = state.processes.map((process) => {
      const assigned = new Set(getProcessAssignments(process.id).map((item) => item.employeeId)).size;
      const dayBadges = DAYS.map((label, index) => `<span class="day-badge${process.operatingDays.includes(index) ? " active" : ""}">${label.slice(0, 3)}</span>`).join("");
      const overrides = Object.entries(process.dayMinimums || {}).filter(([day, value]) => process.operatingDays.includes(Number(day)) && Number(value) > 0).map(([day, value]) => `${DAYS[Number(day)]} ${value}`).join(", ");
      const staffingText = `${process.minStaff} baseline${overrides ? ` · ${overrides}` : ""}`;
      return `<tr><td><span class="table-main">${escapeHtml(brandName(process.brandId))}</span><span class="table-sub">${escapeHtml(byId(state.brands, process.brandId)?.segment || "Client brand")}</span></td><td><span class="table-main">${escapeHtml(process.name)}</span><span class="table-sub">${assigned} assigned resource${assigned === 1 ? "" : "s"}</span></td><td><div class="day-badges">${dayBadges}</div></td><td><span class="holiday-mode">${process.holidayMode === "operate" ? "Operates" : "Day off"}</span></td><td><span class="soft-chip${assigned < process.minStaff ? " amber" : " green"}">${escapeHtml(staffingText)}</span></td><td><div class="table-actions"><button data-edit-process="${escapeHtml(process.id)}">Edit rule</button><button data-delete-process="${escapeHtml(process.id)}">Remove</button></div></td></tr>`;
    }).join("");
    document.getElementById("process-table").innerHTML = `<table class="data-table"><thead><tr><th>BRAND</th><th>PROCESS</th><th>OPERATING DAYS</th><th>PUBLIC HOLIDAY</th><th>MIN. STAFF</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state">Add your first process to define client coverage.</div></td></tr>`}</tbody></table><div class="rule-footer-note">Minimum staffing is enforced on every active process day. Weekly rest days are treated as preferences; approved leave remains a hard availability constraint.</div>`;
  }

  function renderIssues() {
    const errors = validationCache.issues.filter((issue) => issue.level === "error").length;
    const warnings = validationCache.issues.filter((issue) => issue.level === "warning").length;
    const info = validationCache.issues.filter((issue) => issue.level === "info").length;
    document.getElementById("issue-summary").innerHTML = `<div class="summary-block"><strong>${errors}</strong><span>Coverage gaps &amp; hard conflicts</span></div><div class="summary-block"><strong>${warnings}</strong><span>Soft-rule warnings</span></div><div class="summary-block"><strong>${info}</strong><span>Planning notes</span></div><div class="summary-block"><strong>${state.leaves.filter((leave) => leave.approved !== false).length}</strong><span>Approved leave dates</span></div>`;
    const filter = document.getElementById("issue-filter").value;
    const issues = validationCache.issues.filter((issue) => filter === "all" || (filter === "error" ? issue.level === "error" : issue.level === "warning"));
    const list = document.getElementById("issue-list");
    if (!issues.length) {
      list.innerHTML = `<div class="issue-empty"><span class="check-circle">✓</span><strong>${state.roster.month === selectedMonth ? "No open conflicts" : "Ready to plan"}</strong><p>${state.roster.month === selectedMonth ? "The current schedule satisfies required coverage rules." : `Generate the ${escapeHtml(monthTitle(selectedMonth))} roster to check coverage.`}</p></div>`;
    } else {
      list.innerHTML = issues.map((issue) => {
        const action = issue.type === "gap" ? `<button class="issue-action" data-add-backup="${escapeHtml(issue.processId)}">Add backup</button>` : issue.date ? `<button class="issue-action" data-open-issue="${escapeHtml(issue.id)}">Open day</button>` : "";
        const datePill = issue.date ? `<span>${escapeHtml(formatDate(issue.date, { weekday: "short", month: "short", day: "numeric" }))}</span>` : "";
        const brandPill = issue.brandId ? `<span>${escapeHtml(brandName(issue.brandId))}</span>` : "";
        return `<div class="issue-row"><span class="issue-icon${issue.level === "warning" ? " warning" : ""}">${issue.level === "info" ? "i" : issue.level === "warning" ? "↗" : "!"}</span><span class="issue-copy"><strong>${escapeHtml(issue.title)}</strong><p>${escapeHtml(issue.detail)}</p><span class="issue-meta">${brandPill}${datePill}<span>${issue.level === "error" ? "Hard conflict" : issue.level === "warning" ? "Preference" : "Planning note"}</span></span></span>${action}</div>`;
      }).join("");
    }
    const scenarioRoot = document.getElementById("scenario-banner");
    if (state.scenario) {
      const scenarioEmployee = employeeName(state.scenario.employeeId);
      const scenarioDate = formatDate(state.scenario.date, { weekday: "long", month: "long", day: "numeric" });
      const affected = validationCache.issues.filter((issue) => issue.date === state.scenario.date && issue.level === "error").length;
      scenarioRoot.innerHTML = `<div class="scenario-banner"><span class="scenario-icon">↗</span><span class="scenario-copy"><strong>Leave-change scenario active · ${escapeHtml(scenarioEmployee)} · ${escapeHtml(scenarioDate)}</strong><p>${affected ? `${affected} finding${affected === 1 ? "" : "s"} show the impact. Add a trained backup to close the gap, then regenerate.` : "The schedule was refreshed. Review the new coverage before publishing."}</p></span><span class="scenario-actions"><button class="button button-secondary" data-action="undo-scenario">Undo change</button><button class="button button-primary" data-action="generate">Regenerate plan</button></span></div>`;
    } else scenarioRoot.innerHTML = "";
    document.getElementById("change-count").textContent = state.changeLog.length;
    document.getElementById("change-log").innerHTML = state.changeLog.length ? state.changeLog.slice(0, 8).map((item) => `<div class="change-log-item"><span class="change-log-icon">↗</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail || "Workspace updated")} · ${escapeHtml(relativeTime(item.at))}</small></span></div>`).join("") : `<div class="change-empty">No changes recorded yet. Schedule edits and availability updates will appear here.</div>`;
    document.getElementById("nav-issue-count").textContent = errors;
    document.getElementById("nav-alert-dot").style.display = errors ? "block" : "none";
  }
  function relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "just now";
    const minutes = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function openDialog(dialogId) { document.getElementById(dialogId).showModal(); }
  function closeDialog(dialogId) { const dialog = document.getElementById(dialogId); if (dialog.open) dialog.close(); }
  function setModal(type, id, title, eyebrow, body) {
    currentRecord = { type, id };
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-eyebrow").textContent = eyebrow;
    document.getElementById("modal-content").innerHTML = body;
    openDialog("record-dialog");
  }
  function field(label, name, value, type = "text", extra = "") {
    return `<div class="form-field"><label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label><input id="field-${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${extra} /></div>`;
  }
  function selectField(label, name, options, selected) {
    return `<div class="form-field"><label for="field-${escapeHtml(name)}">${escapeHtml(label)}</label><select id="field-${escapeHtml(name)}" name="${escapeHtml(name)}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></div>`;
  }
  function openEmployeeDialog(id = "") {
    const employee = id ? byId(state.employees, id) : null;
    const podOptions = state.pods.map((pod) => [pod.id, pod.name]);
    const offOptions = DAYS_LONG.map((day, index) => [String(index), day]);
    const body = `<div class="form-grid">${field("Full name", "name", employee?.name || "")}${field("Job title", "title", employee?.title || "Operations associate")}${selectField("Operational pod", "podId", podOptions, employee?.podId || state.pods[0]?.id || "")}${selectField("Preferred weekly off", "weeklyOff", offOptions, String(employee?.weeklyOff ?? 0))}</div><p class="form-hint" style="margin-top:10px">Approved leave is managed separately. Preferred weekly off can be overridden when required client coverage has no alternative.</p>`;
    setModal("employee", id, employee ? "Edit employee" : "Add employee", "TEAM DIRECTORY", body);
  }
  function openBrandDialog(id = "") {
    const brand = id ? byId(state.brands, id) : null;
    const body = `<div class="form-grid">${field("Brand name", "name", brand?.name || "")}${field("Brand segment", "segment", brand?.segment || "Direct to consumer")}</div>${brand ? `<p class="form-hint" style="margin-top:10px">Renaming a brand updates all linked processes and allocations automatically.</p>` : `<p class="form-hint" style="margin-top:10px">New brands start with Customer Support, Abandoned Cart, and Non-Delivery Reports calendars (Monday to Saturday, public holidays off). Add employees and resource allocations after saving.</p>`}`;
    setModal("brand", id, brand ? "Edit brand" : "Add a brand", "CLIENT ACCOUNTS", body);
  }
  function openAssignmentDialog(brandId = "", processId = "", id = "") {
    const assignment = id ? byId(state.assignments, id) : null;
    const targetBrand = assignment?.brandId || brandId || state.brands[0]?.id || "";
    const peopleOptions = state.employees.map((employee) => [employee.id, `${employee.name} · ${podName(employee.podId)}`]);
    const brandOptions = state.brands.map((brand) => [brand.id, brand.name]);
    const processes = getBrandProcesses(targetBrand);
    const targetProcess = assignment?.processId || processId || processes[0]?.id || "";
    const body = `<div class="form-grid">${selectField("Employee", "employeeId", peopleOptions, assignment?.employeeId || state.employees[0]?.id || "")}${selectField("Brand", "brandId", brandOptions, targetBrand)}<div class="form-field full"><label for="field-processId">Process</label><select id="field-processId" name="processId">${processes.map((process) => `<option value="${escapeHtml(process.id)}"${process.id === targetProcess ? " selected" : ""}>${escapeHtml(process.name)}</option>`).join("")}</select></div></div><p class="form-hint" style="margin-top:10px">Assignments determine who can be scheduled for the process. If one employee handles several processes for the same brand, the scheduler can group those tasks on the same day.</p>`;
    setModal("assignment", id, assignment ? "Edit allocation" : "Add resource assignment", "RESOURCE ALLOCATION", body);
    document.getElementById("field-brandId").addEventListener("change", (event) => {
      const choices = getBrandProcesses(event.target.value);
      const select = document.getElementById("field-processId");
      select.innerHTML = choices.map((process) => `<option value="${escapeHtml(process.id)}">${escapeHtml(process.name)}</option>`).join("");
    }, { once: true });
  }
  function openProcessDialog(id = "") {
    const process = id ? byId(state.processes, id) : null;
    const brandOptions = state.brands.map((brand) => [brand.id, brand.name]);
    const dayInputs = DAYS.map((day, index) => `<label class="day-toggle"><input type="checkbox" name="operatingDays" value="${index}"${(process?.operatingDays || [1, 2, 3, 4, 5, 6]).includes(index) ? " checked" : ""}><span>${day.slice(0, 3)}</span></label>`).join("");
    const overrideInputs = DAYS_LONG.map((day, index) => `<div class="form-field"><label for="day-min-${index}">${day}</label><input id="day-min-${index}" name="dayMinimum-${index}" type="number" min="1" max="20" placeholder="${process?.minStaff || 1}" value="${escapeHtml(process?.dayMinimums?.[index] || "")}" /></div>`).join("");
    const body = `<div class="form-grid">${selectField("Client brand", "brandId", brandOptions, process?.brandId || state.brands[0]?.id || "")}${field("Process name", "name", process?.name || "Customer Support")}${field("Minimum staff per operating day", "minStaff", process?.minStaff || 1, "number", "min=1 max=20")}${selectField("Public holidays", "holidayMode", [["off", "Day off"], ["operate", "Operates as usual"]], process?.holidayMode || "off")}<div class="form-field full"><span class="form-label">Operating days</span><div class="checkbox-grid">${dayInputs}</div><span class="form-hint">Choose the days this client process requires staffing.</span></div><div class="form-field full"><span class="form-label">Optional day-specific minimum staffing</span><div class="form-grid day-minimum-grid">${overrideInputs}</div><span class="form-hint">Leave a day blank to use the baseline minimum. A day-specific value replaces the baseline for that day.</span></div></div>`;
    setModal("process", id, process ? "Edit process rules" : "Add a process", "COVERAGE CALENDAR", body);
  }
  function openPodDialog(id = "") {
    const pod = id ? byId(state.pods, id) : null;
    const body = `<div class="form-grid">${field("Pod name", "name", pod?.name || "")}${field("Pod lead", "lead", pod?.lead || "")}</div>`;
    setModal("pod", id, pod ? "Edit pod" : "Add a pod", "TEAM STRUCTURE", body);
  }
  function openLeaveDialog(employeeId) {
    const employee = byId(state.employees, employeeId);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const date = dateKey(makeDate(selectedMonth, Math.min(daysInMonth(selectedMonth), Math.max(1, tomorrow.getDate()))));
    const body = `<div class="form-grid">${field("Employee", "employeeName", employee?.name || "", "text", "disabled")}${field("Date", "date", date, "date", "required")}${selectField("Availability type", "kind", [["planned leave", "Planned leave"], ["comp-off", "Comp-off"]], "planned leave")}${selectField("Status", "approved", [["true", "Approved"], ["false", "Pending (not blocked)" ]], "true")}</div><p class="form-hint" style="margin-top:10px">Approved leave and comp-off block scheduling. Adding approved time off validates the current plan and highlights affected assignments.</p>`;
    setModal("leave", employeeId, "Record leave or comp-off", "AVAILABILITY", body);
  }
  function openHolidayDialog() {
    const holidays = [...state.holidays].sort((a, b) => a.date.localeCompare(b.date));
    const body = `<div class="form-grid">${field("Holiday name", "holidayName", "")}${field("Date", "holidayDate", `${selectedMonth}-01`, "date")}</div><button class="button button-secondary" type="button" id="add-holiday-inline" style="margin-top:10px;height:29px">＋ Add holiday date</button><div class="holiday-list" id="holiday-list">${holidays.map((holiday) => `<div class="holiday-row"><span>${escapeHtml(holiday.name)} <small>· ${escapeHtml(formatDate(holiday.date, { month: "short", day: "numeric", year: "numeric" }))}</small></span><button class="table-action" type="button" data-remove-holiday="${escapeHtml(holiday.date)}">Remove</button></div>`).join("") || `<div class="empty-state">No public holidays configured.</div>`}</div><p class="form-hint" style="margin-top:10px">Processes marked “Day off” do not require coverage on these dates. Holiday dates are workspace-wide.</p>`;
    setModal("holidays", "", "Manage public holidays", "WORKING CALENDAR", body);
    document.getElementById("add-holiday-inline").addEventListener("click", addHolidayInline);
  }
  function addHolidayInline() {
    const name = document.querySelector('[name="holidayName"]').value.trim();
    const date = document.querySelector('[name="holidayDate"]').value;
    if (!name || !date) { showToast("Enter a holiday name and date first.", true); return; }
    const existing = state.holidays.find((item) => item.date === date);
    if (existing) { existing.name = name; } else state.holidays.push({ date, name });
    touchState(); recordChange("Public holiday updated", `${name} · ${date}`); persist();
    const modal = document.getElementById("modal-content");
    const list = document.getElementById("holiday-list");
    list.innerHTML = [...state.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => `<div class="holiday-row"><span>${escapeHtml(holiday.name)} <small>· ${escapeHtml(formatDate(holiday.date, { month: "short", day: "numeric", year: "numeric" }))}</small></span><button class="table-action" type="button" data-remove-holiday="${escapeHtml(holiday.date)}">Remove</button></div>`).join("");
    modal.querySelector('[name="holidayName"]').value = "";
    renderAll();
    showToast("Holiday saved. Regenerate the roster to apply the updated calendar.");
  }
  function openCoverageEditor(processId, dateString) {
    const process = byId(state.processes, processId);
    if (!process) return;
    const result = evaluateProcessDate(process, dateString);
    const assignmentsForProcess = getProcessAssignments(processId);
    const available = assignmentsForProcess.map((assignment) => byId(state.employees, assignment.employeeId)).filter(Boolean);
    const checkboxes = available.map((employee) => {
      const selected = result.scheduledIds.includes(employee.id);
      const unavailable = hasApprovedLeave(employee.id, dateString);
      return `<label class="check-item${unavailable ? " disabled" : ""}"><input type="checkbox" name="staffIds" value="${escapeHtml(employee.id)}"${selected ? " checked" : ""}${unavailable ? " disabled" : ""}><span><strong>${escapeHtml(employee.name)}${unavailable ? " · on approved leave" : ""}</strong><small>${escapeHtml(podName(employee.podId))} · preferred off ${escapeHtml(DAYS_LONG[employee.weeklyOff])}${employee.weeklyOff === new Date(`${dateString}T12:00:00`).getDay() ? " · rest-day override" : ""}</small></span></label>`;
    }).join("");
    currentAssignmentEdit = { processId, dateString };
    document.getElementById("assignment-title").textContent = `${brandName(process.brandId)} · ${process.name}`;
    document.getElementById("assignment-content").innerHTML = `<p style="font-size:14px;color:#889287;margin:0 0 12px">${escapeHtml(formatDate(dateString))} · Select the employees assigned to this process today. Minimum staffing: ${minimumFor(process, new Date(`${dateString}T12:00:00`))}.</p><div class="checklist">${checkboxes || `<div class="empty-state">No employees are assigned to this process. Add a resource allocation first.</div>`}</div><p class="form-hint" style="margin-top:10px">A team member can cover multiple processes within this brand. Their assignments to any second brand on the same date will be flagged as an overlap.</p>`;
    openDialog("assignment-dialog");
  }
  function saveRecord(event) {
    event.preventDefault();
    if (!currentRecord) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key) => String(data.get(key) || "").trim();
    const type = currentRecord.type;
    const id = currentRecord.id;
    if (type === "employee") {
      const name = value("name");
      if (!name || !value("podId")) { showToast("Add an employee name and select a pod.", true); return; }
      const employee = id ? byId(state.employees, id) : { id: nextId(state.employees, "e", 2), name: "", podId: "", weeklyOff: 0, title: "Operations associate" };
      const changedName = employee.name && employee.name !== name;
      employee.name = name; employee.title = value("title") || "Operations associate"; employee.podId = value("podId"); employee.weeklyOff = Number(value("weeklyOff"));
      if (!id) state.employees.push(employee);
      touchState(); recordChange(id ? (changedName ? "Employee profile updated" : "Employee schedule updated") : "Employee added", `${employee.name} · ${podName(employee.podId)}`);
      closeDialog("record-dialog"); persist(); renderAll(); showToast(id ? "Employee profile saved." : "Employee added. Add resource allocations to schedule them.");
    } else if (type === "brand") {
      const name = value("name");
      if (!name) { showToast("Brand name is required.", true); return; }
      if (id) {
        const brand = byId(state.brands, id); if (!brand) return;
        brand.name = name; brand.segment = value("segment") || "Client brand";
        touchState(); recordChange("Brand details updated", name);
      } else {
        const brandId = nextId(state.brands, "brand", 2);
        state.brands.push({ id: brandId, name, segment: value("segment") || "Direct to consumer" });
        const defaults = [["Customer Support", "cs"], ["Abandoned Cart", "acc"], ["Non-Delivery Reports", "ndr"]];
        defaults.forEach(([processName, suffix]) => state.processes.push({ id: `${brandId}-${suffix}`, brandId, name: processName, operatingDays: [1, 2, 3, 4, 5, 6], holidayMode: "off", minStaff: 1 }));
        touchState(); recordChange("Brand added", `${name} · default process calendars created`);
      }
      closeDialog("record-dialog"); persist(); renderAll(); showToast(id ? "Brand details saved." : "Brand added with three default process calendars.");
    } else if (type === "assignment") {
      const employeeId = value("employeeId"); const brandId = value("brandId"); const processId = value("processId");
      const process = byId(state.processes, processId);
      if (!employeeId || !brandId || !process || process.brandId !== brandId) { showToast("Select an employee, brand, and process.", true); return; }
      if (state.assignments.some((item) => item.employeeId === employeeId && item.processId === processId && item.id !== id)) { showToast("That employee is already assigned to this process.", true); return; }
      if (id) {
        const assignment = byId(state.assignments, id); if (!assignment) return;
        assignment.employeeId = employeeId; assignment.brandId = brandId; assignment.processId = processId;
      } else state.assignments.push({ id: nextId(state.assignments, "allocation", 3), employeeId, brandId, processId });
      touchState(); recordChange(id ? "Resource allocation updated" : "Resource assigned", `${employeeName(employeeId)} · ${brandName(brandId)} · ${processName(processId)}`);
      closeDialog("record-dialog"); persist(); renderAll(); showToast("Allocation saved. Regenerate the roster to include it.");
    } else if (type === "process") {
      const name = value("name"); const brandId = value("brandId");
      const operatingDays = data.getAll("operatingDays").map(Number);
      if (!name || !brandId || !operatingDays.length) { showToast("Add a name, brand, and at least one operating day.", true); return; }
      const minStaff = Math.max(1, Math.min(20, Number(value("minStaff")) || 1));
      const dayMinimums = {};
      for (let day = 0; day < 7; day += 1) {
        const override = Number(value(`dayMinimum-${day}`));
        if (override > 0) dayMinimums[day] = Math.min(20, override);
      }
      if (id) {
        const process = byId(state.processes, id); if (!process) return;
        process.name = name; process.brandId = brandId; process.operatingDays = operatingDays; process.holidayMode = value("holidayMode"); process.minStaff = minStaff; process.dayMinimums = dayMinimums;
        state.assignments.filter((item) => item.processId === id).forEach((item) => { item.brandId = brandId; });
      } else state.processes.push({ id: nextId(state.processes, "process", 2), brandId, name, operatingDays, holidayMode: value("holidayMode"), minStaff, dayMinimums });
      touchState(); recordChange(id ? "Process rules updated" : "Process calendar added", `${brandName(brandId)} · ${name}`);
      closeDialog("record-dialog"); persist(); renderAll(); showToast(id ? "Coverage rule saved." : "Process added. Add employee assignments to cover it.");
    } else if (type === "pod") {
      const name = value("name"); const lead = value("lead");
      if (!name || !lead) { showToast("Enter both a pod name and pod lead.", true); return; }
      if (id) { const pod = byId(state.pods, id); if (!pod) return; pod.name = name; pod.lead = lead; }
      else state.pods.push({ id: nextId(state.pods, "pod", 1), name, lead });
      touchState(); recordChange(id ? "Pod updated" : "Pod added", `${name} · Lead: ${lead}`);
      closeDialog("record-dialog"); persist(); renderAll(); showToast("Pod details saved.");
    } else if (type === "leave") {
      const date = value("date");
      if (!date) { showToast("Choose a leave date.", true); return; }
      const approved = value("approved") === "true";
      const employee = byId(state.employees, id);
      if (!employee) return;
      const kind = value("kind") || "planned leave";
      if (!state.leaves.some((leave) => leave.employeeId === id && leave.date === date)) state.leaves.push({ employeeId: id, date, approved, kind });
      else { const existing = state.leaves.find((leave) => leave.employeeId === id && leave.date === date); existing.approved = approved; existing.kind = kind; }
      touchState(); recordChange(approved ? `Approved ${kind} added` : `Pending ${kind} request added`, `${employee.name} · ${formatDate(date, { month: "short", day: "numeric", year: "numeric" })}`);
      closeDialog("record-dialog"); persist(); renderAll(); showToast(approved ? "Approved time off saved. Review affected coverage." : "Pending request saved without blocking the roster.");
    } else if (type === "holidays") {
      closeDialog("record-dialog"); renderAll();
    }
  }
  function nextId(collection, prefix, width = 2) {
    let number = collection.reduce((max, item) => {
      const match = String(item.id).match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    let id = `${prefix}-${String(number).padStart(width, "0")}`;
    while (collection.some((item) => item.id === id)) { number += 1; id = `${prefix}-${String(number).padStart(width, "0")}`; }
    return id;
  }
  function saveManualCoverage(event) {
    event.preventDefault();
    if (!currentAssignmentEdit) return;
    const { processId, dateString } = currentAssignmentEdit;
    const selectedIds = [...document.querySelectorAll('#assignment-content [name="staffIds"]:checked')].map((input) => input.value);
    const process = byId(state.processes, processId);
    if (new Set(selectedIds).size !== selectedIds.length) { showToast("Choose distinct employees for each staffing slot.", true); return; }
    if (selectedIds.some((id) => !isAssigned(id, processId))) { showToast("Only employees assigned to this process can be selected.", true); return; }
    const date = new Date(`${dateString}T12:00:00`);
    if (selectedIds.some((id) => hasApprovedLeave(id, dateString))) { showToast("Employees on approved leave cannot be scheduled.", true); return; }
    const planDay = state.roster.plan[dateString] ||= {};
    planDay[processId] = selectedIds;
    state.roster.sourceVersion = state.version;
    recordChange("Daily process assignment edited", `${brandName(process.brandId)} · ${process.name} · ${formatDate(dateString, { month: "short", day: "numeric" })}`);
    closeDialog("assignment-dialog"); persist(); renderAll(); showToast("Assignment updated and validated.");
  }
  function simulateChange() {
    const candidateProcess = state.processes.find((process) => process.name.toLowerCase().includes("non-delivery") && getProcessAssignments(process.id).length === 1 && new Set(getBrandAssignments(process.brandId).map((item) => item.employeeId)).size > 1 && process.operatingDays.length >= 5) || state.processes.find((process) => getProcessAssignments(process.id).length === 1);
    if (!candidateProcess) { showToast("Add a single-resource process to try a leave scenario.", true); return; }
    const employeeId = getProcessAssignments(candidateProcess.id)[0]?.employeeId;
    if (!employeeId) { showToast("Assign an employee to the process before trying a scenario.", true); return; }
    const [year, month] = selectedMonth.split("-").map(Number);
    const today = new Date();
    const startDay = selectedMonth === currentMonthKey() ? today.getDate() + 1 : 1;
    let dateString = "";
    for (let day = Math.max(1, startDay); day <= daysInMonth(selectedMonth); day += 1) {
      const date = makeDate(selectedMonth, day);
      const key = dateKey(date);
      if (isProcessOperating(candidateProcess, date) && !hasApprovedLeave(employeeId, key) && (state.roster.plan?.[key]?.[candidateProcess.id] || []).includes(employeeId)) { dateString = key; break; }
    }
    if (!dateString) {
      for (let day = 1; day < Math.max(1, startDay); day += 1) {
        const date = makeDate(selectedMonth, day); const key = dateKey(date);
        if (isProcessOperating(candidateProcess, date) && !hasApprovedLeave(employeeId, key) && (state.roster.plan?.[key]?.[candidateProcess.id] || []).includes(employeeId)) { dateString = key; break; }
      }
    }
    if (!dateString) { showToast("No scheduled operating date is available in this month.", true); return; }
    if (!state.leaves.some((leave) => leave.employeeId === employeeId && leave.date === dateString && leave.approved !== false)) state.leaves.push({ employeeId, date: dateString, approved: true, kind: "scenario leave" });
    state.scenario = { employeeId, date: dateString, brandId: candidateProcess.brandId, processId: candidateProcess.id, createdAt: new Date().toISOString() };
    touchState(); recordChange("Leave-change scenario created", `${employeeName(employeeId)} · ${brandName(candidateProcess.brandId)} · ${formatDate(dateString, { month: "short", day: "numeric" })}`);
    persist(); refreshValidation(); navigate("issues"); showToast("Scenario added. Review the affected coverage and backup recommendation.", true);
  }
  function undoScenario() {
    if (!state.scenario) return;
    const { employeeId, date } = state.scenario;
    state.leaves = state.leaves.filter((leave) => !(leave.employeeId === employeeId && leave.date === date && leave.kind === "scenario leave"));
    state.scenario = null; touchState(); recordChange("Leave-change scenario undone", `${employeeName(employeeId)} · ${formatDate(date, { month: "short", day: "numeric" })}`);
    persist(); renderAll(); showToast("Scenario removed. Existing roster assignments are available again.");
  }
  function handleDelete(action, id) {
    if (action === "employee") {
      const employee = byId(state.employees, id); if (!employee) return;
      if (!window.confirm(`Remove ${employee.name}? This also removes their allocations and leave records.`)) return;
      state.employees = state.employees.filter((item) => item.id !== id);
      state.assignments = state.assignments.filter((item) => item.employeeId !== id);
      state.leaves = state.leaves.filter((item) => item.employeeId !== id);
      for (const day of Object.values(state.roster.plan || {})) for (const [processId, ids] of Object.entries(day)) day[processId] = ids.filter((employeeId) => employeeId !== id);
      recordChange("Employee removed", employee.name);
    } else if (action === "brand") {
      const brand = byId(state.brands, id); if (!brand) return;
      if (!window.confirm(`Remove ${brand.name} and its processes, allocations, and roster entries?`)) return;
      const processIds = new Set(getBrandProcesses(id).map((process) => process.id));
      state.brands = state.brands.filter((item) => item.id !== id);
      state.processes = state.processes.filter((item) => item.brandId !== id);
      state.assignments = state.assignments.filter((item) => item.brandId !== id);
      for (const day of Object.values(state.roster.plan || {})) for (const processId of processIds) delete day[processId];
      recordChange("Brand removed", brand.name);
    } else if (action === "assignment") {
      const assignment = byId(state.assignments, id); if (!assignment) return;
      if (!window.confirm(`Remove ${employeeName(assignment.employeeId)} from ${brandName(assignment.brandId)} · ${processName(assignment.processId)}?`)) return;
      state.assignments = state.assignments.filter((item) => item.id !== id);
      for (const day of Object.values(state.roster.plan || {})) for (const processId of Object.keys(day)) day[processId] = day[processId].filter((employeeId) => employeeId !== assignment.employeeId || processId !== assignment.processId);
      recordChange("Resource allocation removed", `${employeeName(assignment.employeeId)} · ${processName(assignment.processId)}`);
    } else if (action === "process") {
      const process = byId(state.processes, id); if (!process) return;
      if (!window.confirm(`Remove the ${process.name} calendar and its employee allocations?`)) return;
      state.processes = state.processes.filter((item) => item.id !== id);
      state.assignments = state.assignments.filter((item) => item.processId !== id);
      for (const day of Object.values(state.roster.plan || {})) delete day[id];
      recordChange("Process calendar removed", `${brandName(process.brandId)} · ${process.name}`);
    } else if (action === "pod") {
      const pod = byId(state.pods, id); if (!pod) return;
      if (state.employees.some((employee) => employee.podId === id)) { showToast("Move employees to another pod before removing this pod.", true); return; }
      if (!window.confirm(`Remove the ${pod.name} pod?`)) return;
      state.pods = state.pods.filter((item) => item.id !== id); recordChange("Pod removed", pod.name);
    }
    touchState(); persist(); renderAll(); showToast("Workspace updated. Regenerate the roster to apply this change.");
  }
  function openIssueDate(issueId) {
    const issue = validationCache.issues.find((item) => item.id === issueId);
    if (!issue) return;
    if (issue.date) selectedDate = issue.date;
    navigate("roster");
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, `rosterly-workspace-${selectedMonth}.json`);
    showToast("Workspace data exported as JSON.");
  }
  function exportCsv() {
    if (state.roster.month !== selectedMonth) { showToast("Generate this month's roster before exporting.", true); return; }
    const rows = [["Date", "Day", "Brand", "Process", "Employee", "Coverage", "Minimum staff", "Holiday"]];
    for (let day = 1; day <= daysInMonth(selectedMonth); day += 1) {
      const date = makeDate(selectedMonth, day); const dateString = dateKey(date); const holiday = holidayFor(dateString)?.name || "";
      for (const process of state.processes.filter((item) => isProcessOperating(item, date))) {
        const result = evaluateProcessDate(process, dateString);
        const employees = result.scheduledIds.filter((id) => isAssigned(id, process.id)).map(employeeName);
        rows.push([dateString, DAYS_LONG[date.getDay()], brandName(process.brandId), process.name, employees.join("; "), result.missing ? `Gap ${result.missing}` : "Covered", String(result.minimum), holiday]);
      }
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `roster-${selectedMonth}.csv`);
    showToast("Roster exported as CSV.");
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importWorkspace(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeState(JSON.parse(String(reader.result)));
        if (!Array.isArray(imported.employees) || !Array.isArray(imported.processes) || !Array.isArray(imported.brands)) throw new Error("This file is missing required workspace data.");
        for (const key of ["pods", "employees", "brands", "processes", "assignments", "holidays", "leaves", "roster", "changeLog", "scenario", "version"]) {
          state[key] = imported[key];
        }
        selectedMonth = state.roster.month || selectedMonth; selectedDate = "";
        refreshValidation(); persist(); renderAll(); showToast("Workspace data imported.");
      } catch (error) { showToast(error.message || "Could not read this workspace file.", true); }
    };
    reader.readAsText(file);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-select-date]");
    if (!target) return;
    if (target.dataset.view) { navigate(target.dataset.view); return; }
    if (target.dataset.navigate) { navigate(target.dataset.navigate); return; }
    if (target.dataset.selectDate) {
      if (target.dataset.selectDate.slice(0, 7) !== selectedMonth) {
        selectedMonth = target.dataset.selectDate.slice(0, 7);
        selectedDate = target.dataset.selectDate;
        generateRoster(false);
      } else {
        selectedDate = target.dataset.selectDate;
        renderRoster(); renderOverview();
      }
      return;
    }
    if (target.dataset.directory) { currentDirectory = target.dataset.directory; renderDirectory(); return; }
    if (target.dataset.action) {
      const action = target.dataset.action;
      if (action === "generate") generateRoster(true);
      else if (action === "validate") { refreshValidation(); renderAll(); navigate("issues"); showToast("Validation completed."); }
      else if (action === "simulate-change") simulateChange();
      else if (action === "undo-scenario") undoScenario();
      else if (action === "add-assignment") openAssignmentDialog();
      else if (action === "add-employee") openEmployeeDialog();
      else if (action === "add-process") openProcessDialog();
      else if (action === "manage-holidays") openHolidayDialog();
      return;
    }
    if (target.id === "export-json") { exportWorkspace(); return; }
    if (target.id === "import-json") { document.getElementById("import-file").click(); return; }
    if (target.id === "export-csv") { exportCsv(); return; }
    if (target.id === "roster-help") { openDialog("info-dialog"); return; }
    if (target.id === "directory-refresh") { document.getElementById("directory-search").value = ""; document.getElementById("directory-filter").value = "all"; renderDirectory(); return; }
    if (target.dataset.editCoverage) { openCoverageEditor(target.dataset.editCoverage, target.dataset.editDate); return; }
    if (target.dataset.editEmployee) { openEmployeeDialog(target.dataset.editEmployee); return; }
    if (target.dataset.addLeave) { openLeaveDialog(target.dataset.addLeave); return; }
    if (target.dataset.editBrand) { openBrandDialog(target.dataset.editBrand); return; }
    if (target.dataset.editAssignment) { openAssignmentDialog("", "", target.dataset.editAssignment); return; }
    if (target.dataset.editProcess) { openProcessDialog(target.dataset.editProcess); return; }
    if (target.dataset.editPod) { openPodDialog(target.dataset.editPod); return; }
    if (target.dataset.deleteEmployee) { handleDelete("employee", target.dataset.deleteEmployee); return; }
    if (target.dataset.deleteBrand) { handleDelete("brand", target.dataset.deleteBrand); return; }
    if (target.dataset.deleteAssignment) { handleDelete("assignment", target.dataset.deleteAssignment); return; }
    if (target.dataset.deleteProcess) { handleDelete("process", target.dataset.deleteProcess); return; }
    if (target.dataset.deletePod) { handleDelete("pod", target.dataset.deletePod); return; }
    if (target.dataset.removeHoliday) {
      const holiday = holidayFor(target.dataset.removeHoliday);
      if (!holiday) return;
      state.holidays = state.holidays.filter((item) => item.date !== holiday.date);
      touchState(); recordChange("Public holiday removed", holiday.name); persist(); renderAll();
      const list = document.getElementById("holiday-list");
      if (list) list.innerHTML = state.holidays.length ? [...state.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((item) => `<div class="holiday-row"><span>${escapeHtml(item.name)} <small>· ${escapeHtml(formatDate(item.date, { month: "short", day: "numeric", year: "numeric" }))}</small></span><button class="table-action" type="button" data-remove-holiday="${escapeHtml(item.date)}">Remove</button></div>`).join("") : `<div class="empty-state">No public holidays configured.</div>`;
      showToast("Holiday removed. Regenerate the roster to apply the updated calendar."); return;
    }
    if (target.dataset.addBackup) { openAssignmentDialog(byId(state.processes, target.dataset.addBackup)?.brandId || "", target.dataset.addBackup); return; }
    if (target.dataset.openIssue || target.dataset.issue) { openIssueDate(target.dataset.openIssue || target.dataset.issue); return; }
  });

  document.getElementById("overview-month").addEventListener("change", (event) => { selectedMonth = event.target.value || currentMonthKey(); selectedDate = ""; generateRoster(false); });
  document.getElementById("roster-month").addEventListener("change", (event) => { selectedMonth = event.target.value || currentMonthKey(); selectedDate = ""; generateRoster(false); });
  document.getElementById("view-mode").addEventListener("change", () => { ensureScopeOptions(); renderRoster(); });
  document.getElementById("view-scope").addEventListener("change", renderRoster);
  document.getElementById("directory-search").addEventListener("input", renderDirectory);
  document.getElementById("directory-filter").addEventListener("change", renderDirectory);
  document.getElementById("issue-filter").addEventListener("change", renderIssues);
  document.getElementById("record-form").addEventListener("submit", saveRecord);
  document.getElementById("assignment-form").addEventListener("submit", saveManualCoverage);
  document.getElementById("modal-cancel").addEventListener("click", () => closeDialog("record-dialog"));
  document.getElementById("assignment-cancel").addEventListener("click", () => closeDialog("assignment-dialog"));
  document.getElementById("import-file").addEventListener("change", (event) => importWorkspace(event.target.files[0]));

  if (state.roster.month !== selectedMonth || !state.roster.plan || !Object.keys(state.roster.plan).length) generateRoster(false);
  else { selectedDate = dateKey(makeDate(selectedMonth, Math.min(daysInMonth(selectedMonth), selectedMonth === currentMonthKey() ? new Date().getDate() : 1))); renderAll(); }
})();
