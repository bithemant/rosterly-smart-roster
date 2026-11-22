# Approach and design decisions

This note describes the submitted Rosterly application against the assessment questions. The application intentionally starts empty: actual staffing rows should come from an anonymized workbook, not fabricated names or assignments.

## 1. How are employees, brands, processes, pods, and relationships represented?

PostgreSQL stores employees, pods, brands, processes, weekday operating rules, eligibility allocations, holidays, availability, user accounts, and versioned roster assignments as separate records. An employee belongs to one pod; brands can belong to a pod or be shared; processes belong to brands; eligibility is a dated many-to-many employee/process allocation with a primary or backup flag. Employees also store preferred and mandatory weekly-off days and a daily capacity limit.

This keeps operating calendars and resource eligibility explicit. It allows a single-resource brand to be modeled with one eligible employee and a multi-resource brand to have several people eligible for one or more processes.

## 2. How is a roster generated and validated?

The deterministic planner expands the target month into process-day staffing slots, applying weekday rules and holiday behavior. It prioritizes jobs with fewer eligible resources and selects people who are available, eligible, not on a mandatory off day, within daily capacity, and not already scheduled for an overlapping shift. It spreads monthly assignments, favors primary over backup eligibility, and tries to respect preferred weekly off days.

An independent validator checks saved assignments for coverage gaps, eligibility, approved availability, mandatory off days, preferred-off overrides, overlaps, operating calendars, and daily capacity. The validator does not assume that a generated draft is correct. Publication is blocked while error-level issues remain.

## 3. How are single-resource and multi-employee brands handled?

There is no hard-coded single-resource brand type. The model represents staffing patterns through eligibility rows and process minimums. A process with one eligible employee behaves as single resource; multiple eligibility rows let a process use multiple employees. A person may cover compatible non-overlapping processes within daily capacity, including multiple processes for one brand.

## 4. What happens when the only eligible employee is unavailable?

Approved leave, comp-off, or unavailability excludes that employee for the affected dates. The planner leaves a coverage gap if no eligible backup is available. The validation issue identifies the affected process, date, and number of missing people. A manager can add a trained backup through the source workbook and generate a new draft version. The draft stays reviewable, but cannot be published until all blocking issues are resolved.

## 5. How are conflicts or insufficient staffing handled?

Approved availability, mandatory weekly off days, shift overlaps, and daily capacity are hard constraints. Preferred weekly offs are soft: the planner can override one to fulfill required client coverage and records that decision as a warning. Calendar closure and minimum staffing rules determine required slots. When eligible resources are insufficient, the planner preserves the gap for a manager to resolve instead of assigning an untrained person.

Manual edits go through server-side eligibility, leave, off-day, overlap, and capacity checks. The independent validator recalculates the full draft after each change. Audit events record generation, edits, import application, leave review, and publication.

## 6. Which work is automated, and which remains under human control?

Roster generation, coverage calculation, rule validation, version creation, and issue summaries are automated. Employees submit availability requests. Managers review availability, maintain workforce and eligibility data, make manual adjustments, review issues, and decide when a draft is ready to publish. Role permissions are checked in API handlers. The AI assistant can explain conflicts and suggest review steps, but cannot write to the roster or approve changes.

## 7. What would change if the workforce or brand count doubled?

The normalized data model and PostgreSQL persistence support shared access beyond one browser. The planner currently runs synchronously and uses a greedy assignment strategy, which suits assessment-sized rosters but may need worker queues, query tuning, pagination, and a constraint solver for larger or tightly constrained plans. A production deployment also needs managed database backups, monitoring, secret management, and organization-specific data-retention policies.

## 8. What would be improved with one more week?

I would collect representative anonymized inputs and compare drafts with operations outcomes, add skill and shift constraints required by the team, and replace greedy selection with a solver that balances full-month coverage and fairness. I would also add account disable/reset controls, database backup/restore procedures, and a deployment-specific smoke check once the production host and database are known.

## Trade-offs and current boundaries

- This is a full-stack assessment application, but it is not a production service until real source data, hosting, TLS, database backups, and an operational owner are configured.
- The roster planner does not optimize globally; one local selection can cause a later shortage. The validator makes shortages visible instead of hiding them.
- Imports upsert by stable external key and are additive. They do not delete records omitted from a workbook.
- AI is optional and provider-switchable. No AI key is bundled, and roster decisions do not depend on AI availability.
