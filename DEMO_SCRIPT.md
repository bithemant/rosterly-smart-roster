# Demo video outline (3–5 minutes)

## 0:00–0:30 — The workspace

Introduce Rosterly as a monthly planning tool for operations teams. Point out the 30 employees, 6 pods, 22 brands, and mix of single-resource and shared-resource accounts.

## 0:30–1:15 — Generate and review a month

Open **Roster planner**, select a month, and generate the roster. Show the calendar coverage indicators, then open a date to review the brand/process detail. Switch through company-wide, pod, brand, process, and employee views.

## 1:15–2:00 — Client-specific schedules

Open **Coverage rules**. Compare a single-resource brand's Monday-to-Saturday, public-holiday-off processes with a multi-resource brand's seven-day Customer Support rule. Show baseline staffing, the Saturday-specific minimum, and holiday settings.

## 2:00–2:50 — Make an availability change

Open **Issues & changes** and choose **Simulate leave change**. Explain that the sole Non-Delivery Reports assignee is unavailable on an operating day, so the existing plan shows a leave conflict and coverage gap. Choose **Add backup**, select a teammate already supporting the same brand, save the allocation, then regenerate the roster.

## 2:50–3:30 — Validate and export

Show that same-brand multi-process work is permitted while cross-brand overlap is surfaced. Review the updated findings, then return to the roster and download a CSV. Mention that workspace JSON can be exported and imported for review in another browser.

## Optional closing

Explain the main trade-off: this assessment version uses a deterministic greedy scheduler and local browser storage. A production version would add shared persistence and an optimizer for fairness and more detailed shift constraints.
