# Demo walkthrough (3–5 minutes)

Record this after the workspace has been configured with either your anonymized assessment workbook or the clearly labeled synthetic demo workbook. If using synthetic data, state that clearly. The included December 2026 workbook contains an approved sample leave request for Demo Operator 026 on December 15, plus other synthetic staffing details. Do not show a real credential or personal record you do not have permission to disclose.

For a local recording, open `/recording-studio.html` in a second browser tab, click **Start capture**, select the Rosterly tab, then follow this script. Stop and download the WebM recording from the recorder tab.

## 0:00–0:30 — Sign-in and roles

Show the Rosterly login and role badge after signing in. Explain that the workspace has Administrator, Operations Manager, Pod Lead, and Employee roles, and that API routes check both role and pod scope.

## 0:30–1:10 — Source data

Open **Data import** and briefly show the employee, pod, brand, process, eligibility, availability, and holiday sheets. Validate and apply the selected workbook. Show the import preview and name the dataset accurately: anonymized operational source data or a synthetic assessment demo.

## 1:10–2:05 — Generate the month

Choose the required month and generate a draft. Show coverage, the pod summary, process calendars, and uncovered staffing slots. Explain how approved time away and process eligibility affect assignment selection.

## 2:05–2:45 — Review and change a draft

Open **Monthly roster** and filter by pod or brand. Make a controlled manual assignment change in a draft and show the revalidated result. Explain the difference between a preferred weekly-off warning and blocking issues such as approved leave, overlap, or missing eligibility.

## 2:45–3:25 — Availability and publication

Open **Availability** and show the synthetic approved leave for Demo Operator 026 on December 15. To demonstrate the review workflow, submit a separate request for an employee/date, approve or reject it, and generate a new draft to show that a new numbered version is created from the latest approved availability. Show the real coverage and issue counts displayed by this local run; they depend on the imported workbook and selected month. If a coverage gap remains, explain that a manager must resolve it before publication. Show publication only if the selected draft has no blocking errors, then show its status and CSV export.

## 3:25–4:05 — AI and account access

If a provider and server-side API key are configured, ask the AI assistant to explain a coverage issue. Mention that its key stays on the server and it cannot change the roster. If AI is not configured, use this time to show **User access** and an employee-linked or pod-scoped account.

## Closing

State the main limitation: roster creation is deterministic and greedy, not a global optimizer. Name one next improvement, such as skill constraints or full-month fairness optimization.
