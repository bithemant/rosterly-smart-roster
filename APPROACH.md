# Approach note

Rosterly uses a static browser architecture so a reviewer can run the project without setting up a database, API, or build tool. The workspace is structured as pods, employees, brands, process calendars, resource allocations, holidays, approved leave, and a month-specific plan. Resource allocations are explicit relationships rather than employee or brand fields, which supports shared processes and cross-brand assignments.

The scheduling pass expands each month into required process slots, including optional day-specific staffing minimums. It prioritizes processes with fewer available assigned employees, respects approved leave and comp-off, avoids assigning one employee to two brands on the same date, and balances selections by preferred rest day and monthly assignment count. An employee can cover several compatible processes within one brand on a day. This is a deterministic greedy planner: it is fast and easy to explain, though not guaranteed to find a globally optimal plan.

The validator is independent of the generator. It recalculates process coverage and flags under-staffing, unassigned people, approved leave conflicts, cross-brand overlaps, work on a preferred rest day, and work outside an operating calendar. Manual changes and availability updates can therefore be checked against the same rules as generated plans.

The sample data includes 30 employees across 6 pods, 22 fictional brands, and 66 process calendars. Eighteen brands are single-resource accounts; the remaining four have three-person teams with split and overlapping process allocations. The demonstration scenario removes the sole NDR assignee for one required date, surfaces the resulting gap, and lets a manager add a same-brand backup before regenerating.

The main trade-off is persistence. Browser local storage keeps this assessment easy to run and explore, but workspaces are local to each browser and are not suitable for a live shared operations team. A production version should add authenticated server-side storage, audit history, configurable skill and shift constraints, and an optimizer for full-month fairness.
