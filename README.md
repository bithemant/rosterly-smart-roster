# Rosterly: Smart Roster Management System

Rosterly is a browser-based monthly roster planner for multi-brand operations teams. It keeps employee, pod, brand, process, leave, and holiday data in one workspace; builds a proposed roster; and shows the effect of coverage rules and availability changes.

## Live assessment demo

The public demo is available at [Rosterly Operations Roster Planner](https://rosterly-ops-demo-h4m8.tonedpark64.chatgpt.site). It uses fictional assessment data and browser-local storage; edits are saved in the visitor's browser and are not shared with other visitors.

## Run locally

The project is static HTML, CSS, and JavaScript. It has no build step, database, API key, or `.env` file.

1. Open a terminal in this folder.
2. Start a local web server:

   ```bash
   python -m http.server 4173
   ```

   On Windows, `py -m http.server 4173` also works if the Python launcher is installed.
3. Open [http://localhost:4173](http://localhost:4173).

The sample workspace loads automatically and the current month's roster is generated on first launch. Changes are saved in the current browser's local storage. Use the export and import buttons in the top bar to move a workspace between browsers.

## Main workflows

- **Generate a monthly plan:** choose a month and select **Generate roster**. Every required process day gets up to its configured minimum number of distinct staff.
- **Review coverage:** use the company, pod, brand, process, or employee view. Select a date to inspect process assignments and coverage.
- **Edit the roster:** choose **Edit team** for a process on a specific date. The application immediately validates the change.
- **Change the team model:** add or edit employees, pods, brands, process calendars, day-specific minimum staffing, and employee-to-process allocations in **Team & brands** and **Coverage rules**.
- **Record planned leave or comp-off:** add approved time off to an employee. The existing roster is checked against the new availability, and any affected assignment is flagged.
- **Demonstrate change handling:** open **Issues & changes** and select **Simulate leave change**. The sample scenario makes a single-resource NDR employee unavailable on a required day. Add a same-brand teammate as a backup, regenerate, and review the result.
- **Export:** download the roster as CSV or save/import the complete workspace as JSON.

## Scheduling and validation approach

The generator is deterministic and rule-based. For each date, it creates staffing slots only for processes whose operating-day and holiday rules require coverage, using a day-specific minimum when one is configured. It handles the most constrained processes first, then chooses an assigned, available employee who prefers to work that day and has a lower monthly assignment count. Approved leave and comp-off are hard constraints. A preferred weekly-off day is soft, so required client coverage can take priority; the override is reported as a warning.

An employee can cover multiple processes for the same brand on the same date, reflecting the single-resource brand model. A person cannot cover processes for two brands on the same date. If a required slot has no eligible employee, the roster leaves it open and identifies the brand, process, date, and missing staff count. Managers can assign a trained backup and regenerate, or manually edit and revalidate the schedule.

The generator is a greedy planner rather than a mathematical optimizer. It produces useful, explainable plans quickly, but a locally chosen assignment can prevent a better whole-month arrangement. The validator checks the resulting plan and surfaces gaps rather than treating a generated schedule as automatically valid.

## Sample workspace

The included fictional dataset contains 30 employees in 6 pods, 22 brands, 66 process calendars, and 74 resource allocations. Eighteen brands (about 82%) have one dedicated employee handling all assigned processes. Four brands have teams of three, with separate and overlapping process assignments. Public holidays and different 365-day, Monday-to-Saturday, and holiday-off rules are included.

The public holiday dates and all people and brands in the sample are fictional demonstration data. Replace them with the relevant team's actual calendars before operational use.

## Deployment

This is a static site and can be published directly from the project root. For GitHub Pages:

1. Push the project files to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**, select the `main` branch, and select the repository root (`/`).
3. Wait for Pages to publish the site and use the generated URL as the application link.

Netlify, Cloudflare Pages, and other static hosts can publish the same root folder without a build command. No environment variables are required.

### Current deployment boundary

Rosterly stores data in browser local storage. Each browser has its own workspace, with no login, shared database, automatic cloud backup, or multi-user approval flow. A public deployment makes the app reachable, but it does not make edits visible to other users. For production, add authenticated shared storage, role-based access, audit history, and server-side validation.

## How I approached the assessment

### 1. How did you model employees, brands, processes, pods, and relationships?

Employees belong to a pod and have a preferred weekly-off day. Brands own process calendars. Each process stores its operating days, public-holiday behavior, baseline and optional day-specific minimum staffing. A separate resource-allocation table links employees to brand/process pairs, so employees can support several processes or brands without hard-coding an organizational chart.

### 2. How does the system generate a roster and determine whether it satisfies the constraints?

The generator expands a selected month into daily staffing slots, orders jobs by the number of available assigned employees, and chooses a distinct assigned employee for each required slot. Approved leave and comp-off block scheduling. The validator then checks required coverage, eligibility, approved time off, cross-brand overlaps, and weekly-off overrides. A roster with unresolved shortages remains visible with explicit findings.

### 3. How did you handle single-resource and multi-employee brands?

A single employee can be allocated to every process for one brand and may cover those compatible processes together on a date. A multi-resource brand can allocate different people to different processes and share one process across multiple employees for rotating coverage. The same process-level minimum staffing rule applies to both patterns.

### 4. What happens when the only employee for a brand is unavailable?

Approved leave blocks that employee. The application flags each required process that loses coverage, identifies the date and missing staff, and recommends adding a trained backup. After the manager adds the allocation, they can regenerate and validate the changed plan. The system does not silently move unrelated employees onto client work they are not assigned to.

### 5. How does the system handle conflicting requirements or insufficient staffing?

Approved leave and cross-brand same-day assignments are treated as hard conflicts. Required coverage outranks a preferred weekly-off day, and any override appears as a warning. If a process still cannot meet its minimum staffing, the open slot is reported with a suggested next action so a manager can resolve or accept the risk explicitly.

### 6. Which parts are automated, and which stay under human control?

The app proposes daily assignments, applies availability and client calendars, computes coverage, and explains conflicts. Managers retain control over resource allocations, leave approval, rule changes, manual roster edits, and whether to publish a plan. This keeps client commitments and people decisions reviewable.

### 7. What would change if the team and brand count doubled?

I would move persistence to a shared database, add authenticated roles and an audit trail, and separate the scheduling engine from the browser UI. For larger or more tightly constrained rosters, I would evaluate a constraint solver such as CP-SAT or mixed-integer programming, backed by background jobs and versioned roster runs. The current allocation model can continue to represent the additional brands and team members.

### 8. What would you improve first with one more week?

I would replace the greedy planner with an optimizer that balances coverage, rest-day preferences, weekly workload, and fairness across the full month. I would also add shift lengths and employee skill/eligibility constraints, then persist the roster in a shared backend so pod leads can review changes together.

## Project files

- `index.html` — application shell and views
- `styles.css` — responsive interface styles
- `app.js` — data management, scheduler, validation, and UI behavior
- `sample-data.js` — editable fictional demonstration workspace
- `APPROACH.md` — concise architecture and trade-offs
- `DEMO_SCRIPT.md` — a 3–5 minute walkthrough outline

