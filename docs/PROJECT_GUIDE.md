# Rosterly Smart Roster — Complete Project Guide

This guide describes what is in the repository, how the application works, how to run it, and where the local demo credentials are kept. It is written against the current source code.

## 1. Project purpose and current status

Rosterly is a full-stack monthly staff scheduling application for teams that serve multiple brands and processes. It stores workforce and operating data in PostgreSQL, builds versioned monthly roster drafts, checks those drafts against operating constraints, and limits each account to its role and data scope.

The repository includes an optional, clearly labeled synthetic assessment workbook. It contains 30 pseudonymous operators, 30 fictional brands, five pods, 54 processes, and 68 eligibility allocations for December 2026, plus a sample approved absence and two sample global holidays. The workbook is sample data for demonstrating the workflow; it is not real workforce data. No source workbook was supplied, so replace the synthetic records with approved, anonymized source data before making operational decisions. The source code and local Docker setup are ready to run. A public deployment is not configured: the hosting provider, production database, domain, and TLS setup still need to be supplied.

The interface uses an indigo and coral visual theme. The application is dynamic: the dashboard and roster views are backed by PostgreSQL records and API routes, not a static screenshot or hard-coded roster.

## 2. Technology stack

| Area | Technology | Use in this project |
| --- | --- | --- |
| Web framework | Next.js 16.4.6 | React application, server rendering, and server-side API routes |
| UI | React 19.3.0 | Dashboard, roster grid, forms, import preview, and assistant interface |
| Language | TypeScript 5.9 | Application and server code |
| Database | PostgreSQL | Persistent workforce, access, availability, audit, and roster data |
| Data access | Prisma 7 with `pg` and `@prisma/adapter-pg` | Typed database client and schema migrations |
| Authentication | `bcryptjs`, Node crypto, Next.js cookies | Password hashing, random session tokens, token digests, and browser sessions |
| Input validation | Zod 4 | Validation of API input and import fields |
| Workbook support | ExcelJS 4 | Excel template generation, workbook reading, and demo workbook generation |
| Icons | Lucide React | Interface icons |
| Local database | Docker Compose with PostgreSQL 17 | Local PostgreSQL without a separate PostgreSQL installation |
| Production container | Docker multi-stage build | Standalone Next.js runner and one-shot migration container |
| Code checks | ESLint 9 and TypeScript compiler | Linting and type checking |

The Docker image uses Node.js 22. For a local Node installation, use Node.js 20.9 or newer and npm. The AI feature is optional and calls a configured OpenAI-compatible chat-completions endpoint; there is no AI API key bundled with the project.

## 3. Repository map

| Path | Contents |
| --- | --- |
| `src/app/page.tsx` | Main application entry and sign-in/setup shell |
| `src/components/workspace.tsx` | Main workspace screens and client interactions |
| `src/app/api/` | Authentication, roster, availability, import, AI, overview, and health endpoints |
| `src/lib/scheduling/engine.ts` | Deterministic monthly roster planner and independent validation/coverage calculations |
| `src/lib/importer.ts` | CSV and Excel workbook parsing and validation |
| `src/lib/import-template.ts` | Blank workbook template and sheet definitions |
| `src/lib/auth.ts` | Session creation, lookup, and role checks |
| `src/lib/permissions.ts` | Role and pod/employee scope helpers |
| `src/lib/planner-data.ts` | Database-to-planner input loading and scope filtering |
| `prisma/schema.prisma` | PostgreSQL entities, relationships, enums, and indexes |
| `prisma/migrations/` | Committed database migration history |
| `scripts/export-import-template.ts` | Creates the blank Excel workbook |
| `scripts/generate-demo-workbook.ts` | Creates the labeled synthetic assessment workbook |
| `docs/rosterly-workforce-template.xlsx` | Downloadable blank workbook template |
| `docs/demo-workforce-workbook.xlsx` | Optional synthetic demo workbook |
| `public/recording-studio.html` | Browser screen recorder; video is recorded and downloaded locally by the user |
| `Dockerfile` | Production builder, migration, and runtime image stages |
| `compose.yaml` | Local PostgreSQL service and persistent data volume |
| `compose.production.yaml` | Production application and migration services; expects an external PostgreSQL database |
| `.env.example` | Environment variable template; contains placeholders, not production secrets |
| `README.md` | Shorter project overview and setup instructions |
| `APPROACH.md` | Assessment design answers and known trade-offs |
| `DEMO_SCRIPT.md` | Suggested assessment walkthrough |
| `SUBMISSION_CHECKLIST.md` | Deployment and submission tasks that remain |

## 4. How a request flows through the application

1. A user opens the Next.js interface and signs in. The browser receives an HTTP-only session cookie; the raw session token is not stored in the database.
2. The Next.js API route checks the signed-in user, role, and permitted employee or pod scope on the server. Hiding a button in the interface is not used as the security boundary.
3. The route reads or writes records through Prisma and PostgreSQL. Zod validates request bodies; same-origin checks are applied to browser write requests.
4. Roster generation loads active employees, processes, eligibility, availability, holidays, and pod scope into the scheduling engine.
5. The planner creates a draft. The validator recalculates coverage and constraints, and the draft's assignments and issues are saved as a numbered version.
6. A manager reviews issues, edits the draft if needed, and publishes only after blocking errors are cleared. Important actions create audit events.
7. If configured, the AI route receives a summarized, scoped view of process coverage and issues. It returns guidance to the user; it has no write permission to roster data.

## 5. Main workflow

### First-time workspace setup

On an empty database, open the application and use the initial setup screen. Enter the `SETUP_TOKEN` from the server environment, then choose the first administrator's display name, email, and password. The setup endpoint only succeeds while there are no user accounts. The password must be at least 12 characters. Do not use the setup token for normal sign-in.

### Import workforce data

An administrator or operations manager downloads the Excel template from **Data import**, fills it with anonymized records, and uploads it. The app parses the workbook and shows row counts and validation errors before allowing the user to apply it. A successful import upserts records by stable external keys and adds an import-history entry. Records omitted from a later workbook are retained; imports do not delete omitted records.

The workbook has these sheets and columns:

| Sheet | Columns |
| --- | --- |
| `Pods` | `externalKey`, `name`, `leadEmployeeKey` |
| `Employees` | `externalKey`, `name`, `podKey`, `weeklyOffDays`, `mandatoryOffDays`, `maxDailyMinutes`, `active` |
| `Brands` | `externalKey`, `name`, `podKey`, `active` |
| `Processes` | `externalKey`, `brandKey`, `name`, `operatingDays`, `holidayMode`, `minStaff`, `startTime`, `endTime`, `active` |
| `ProcessRules` | `processKey`, `weekday`, `isOpen`, `minStaff` |
| `Eligibility` | `employeeKey`, `processKey`, `validFrom`, `validUntil`, `isBackup` |
| `Availability` | `employeeKey`, `type`, `startDate`, `endDate`, `status`, `note` |
| `Holidays` | `date`, `name`, `region` |

Identifiers must match across sheets and should remain stable on future imports. Weekdays accept names or ISO numbers (`Mon=1` through `Sun=7`). Dates use `YYYY-MM-DD`, times use 24-hour `HH:MM`, and availability types are `LEAVE`, `COMP_OFF`, or `UNAVAILABLE`. Availability status defaults to `PENDING`; approved records affect planning. The upload limit is 8 MB and the importer accepts up to 20,000 rows. CSV import is limited to employee rows whose pods already exist; use the Excel template for a complete new workspace.

The app stores the uploaded file's name, row count, preview counts, and SHA-256 hash in import history. It does not save the uploaded workbook's row contents in that history. Use anonymized data and protect the connected database and its backups.

### Availability requests

Employees can create a request for themselves. Managers can enter a request for a scoped employee. Requests can be leave, comp-off, or unavailable dates. Requests begin as pending. An administrator, operations manager, or relevant pod lead can approve or reject a pending request. Only approved availability blocks assignments in the planner; pending items still need human review.

### Generate, edit, and publish a roster

An administrator or operations manager chooses a month and generates a draft. The application stores each result as a numbered roster version. When a new draft is generated, any earlier draft for that month is archived; already published versions remain in history. A manager or pod lead with access can make a draft assignment change. The app validates the draft again. Administrators and operations managers can publish a version only when it has no blocking error-level issues. Published schedules can be viewed by employees within their own scope and exported as CSV from the roster screen.

## 6. Scheduling and validation rules

The planner is deterministic and greedy. It does not use AI to pick employees and is not a global mathematical optimizer.

For each date in the selected month, it:

1. Determines whether each active process is open from its default operating weekdays and any per-weekday override. ISO weekdays are Monday 1 through Sunday 7.
2. Applies public holidays for the configured `APP_HOLIDAY_REGION` and `GLOBAL`. A process configured as `CLOSED` is skipped on a matching holiday; `OPEN` processes continue operating.
3. Reads the required headcount from a weekday rule when one exists, otherwise from the process's `minStaff`.
4. Considers employees whose dated eligibility includes the date. It schedules the processes with fewer eligible employees first, then uses process ID for a stable tie-break.
5. Excludes inactive employees, approved absences, mandatory weekly-off days, same-day overlapping shifts, and assignments that exceed the employee's daily minute capacity. A person is assigned at most once to the same process on a date.
6. Scores remaining candidates to prefer people not on their preferred weekly off, primary eligibility over backup eligibility, lower monthly workload, and people who are not already covering another process that day. Ties are stable by employee ID.
7. Records uncovered slots as `COVERAGE_GAP` issues instead of assigning an ineligible employee or hiding the shortage.

The validator separately checks saved assignments for coverage, dates outside the selected month, inactive or unavailable records, operating calendars, eligibility, approved absence, mandatory off days, weekly-off overrides, overlapping shifts, and daily capacity. Coverage gaps and invalid assignments are errors and block publication. A preferred weekly-off override is a warning, because the planner may use it to preserve required coverage. Managers should investigate both errors and warnings before publishing.

Because the planner is greedy, a locally reasonable assignment can consume a person needed by a later process and leave a gap. The validator exposes that gap; the draft needs a human change, updated eligibility, a trained backup, or a different requirement before publication.

## 7. Accounts, roles, and scope

| Role | Data scope | Main permissions |
| --- | --- | --- |
| **Administrator** | All pods and employees | Create user accounts; import data; generate, edit, and publish rosters; review availability; use all manager views |
| **Operations Manager** | All pods and employees | Import data; generate, edit, and publish rosters; review availability; use manager views. Cannot create user accounts. |
| **Pod Lead** | Their assigned pod | View pod data; review availability requests and edit draft assignments within that pod. Cannot import, generate, publish, or manage users. |
| **Employee** | Their linked employee record | View their published roster and create availability requests for themselves. |

Employee accounts must be linked to an employee record. Pod lead accounts must be assigned a managed pod. Server API handlers enforce both roles and scope. Passwords are hashed with bcrypt. Sessions use random tokens whose SHA-256 digests are stored in PostgreSQL; the browser cookie is HTTP-only, SameSite Strict, expires after eight hours, and is marked Secure in production. Five consecutive failed login attempts temporarily lock an account for 15 minutes.

## 8. Database model

| Model | What it stores |
| --- | --- |
| `UserAccount`, `Session` | Sign-in identity, role/scope links, password hash, and expiring session-token digest |
| `SystemSetting` | Setup completion marker and system settings |
| `Pod`, `Employee` | Team structure, active status, weekly-off preferences, mandatory off days, and daily capacity |
| `Brand`, `Process`, `OperatingRule` | Client/brand groupings, shift times, default calendars, holiday policy, and day-specific staffing rules |
| `EmployeeEligibility` | Dated employee-to-process eligibility and primary/backup designation |
| `EmployeeAvailability`, `PublicHoliday` | Time-away requests and region-specific or global public holidays |
| `Roster`, `RosterVersion` | Month container and numbered draft/published/archived snapshots |
| `RosterAssignment`, `RosterIssue` | Per-day assignments and validation results for each version |
| `ImportBatch` | Import filename, uploader, row count, preview summary/hash, and commit time |
| `AuditEvent` | Actor, action, affected entity, and event details for important operations |

Brands can be assigned to a pod or shared. Processes belong to brands. Employee-to-process eligibility is many-to-many and date-aware, so one employee may cover several compatible processes and one process may have multiple trained workers. Whether a process uses one or more workers is defined by `minStaff` and eligibility rows rather than a hard-coded brand category.

## 9. API route map

All routes are implemented as Next.js server routes. Protected routes require a valid session and enforce role/scope rules. Browser write routes also require same-origin requests.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Database connectivity readiness check; 200 when healthy, 503 when not |
| `/api/auth/status` | GET | Setup/login state and whether AI variables are configured |
| `/api/auth/bootstrap` | POST | One-time first administrator creation on an empty database |
| `/api/auth/login` | POST | Sign in and create a session |
| `/api/auth/logout` | POST | Delete current session and clear cookie |
| `/api/auth/users` | GET, POST | List/create accounts; administrator only |
| `/api/overview` | GET | Dashboard summary scoped to the current account |
| `/api/availability` | GET, POST, PATCH | List, request, approve, or reject availability |
| `/api/rosters/generate` | POST | Generate a monthly draft; administrator or operations manager |
| `/api/rosters/[versionId]/assignments` | POST | Create/update a draft assignment after scope and rule checks |
| `/api/rosters/[versionId]/publish` | POST | Publish a validated draft; administrator or operations manager |
| `/api/import` | GET, POST | View recent import history or validate an uploaded CSV/XLSX workbook |
| `/api/import/[batchId]/commit` | POST | Apply a validated import preview |
| `/api/import/template` | GET | Download Excel template, or CSV template with `?format=csv` |
| `/api/ai` | POST | Request optional provider guidance from process-level summary data |

## 10. AI configuration and data sent

Roster generation, validation, import, and publication work without AI. To enable the assistant, set these server-side variables and restart the app:

```env
AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="your-model-name"
AI_API_KEY="your-secret-key"
AI_PROVIDER_LABEL="Your provider"
```

Use a provider that implements `POST {AI_BASE_URL}/chat/completions`. The API key stays on the server and is not sent to the browser. The assistant is sent the month, the user's question, roster status, aggregate coverage, and process-level issue counts. Employee names, email addresses, and phone numbers are redacted from the question/context path before provider calls. Review your provider's privacy and retention terms before enabling it with organizational data. The assistant can explain issues and suggest review steps but cannot create assignments, approve leave, or publish.

## 11. Credentials and secrets

The current local sign-in details are in the ignored file `LOCAL_DEMO_CREDENTIALS.md` at the repository root. The credentials file is created from this machine's ignored `.env`; it is excluded from Git and must not be uploaded or committed. The public `docs/PROJECT_GUIDE.md` intentionally contains no app password, setup token, or AI key.

The local private file contains the current demo administrator email/password and local setup token/connection details. Use the demo login only with this local database. If you create a new empty database, use the setup screen and the `SETUP_TOKEN` from `.env` to define a new first administrator. A database reset or a different host/database does not carry over local accounts.

Never commit `.env`, `.env.production`, database connection strings, real employee data, or AI keys. `.env.example` is the safe template. The local Compose database uses the development-only connection values from `compose.yaml`; do not reuse them for a public deployment.

## 12. Run locally on Windows with PowerShell

### Existing local checkout

Open PowerShell and run these steps in separate terminal windows:

**Terminal 1 — start PostgreSQL:**

```powershell
Set-Location "D:\Github projects\Assignment\rosterly-smart-roster"
docker compose up -d
```

**Terminal 2 — start the web app:**

```powershell
Set-Location "D:\Github projects\Assignment\rosterly-smart-roster"
npm ci
npm run db:deploy
npm run dev -- --port 3002
```

Open [http://localhost:3002](http://localhost:3002). Sign in with the local demo credentials in `LOCAL_DEMO_CREDENTIALS.md`. If the database is empty, the first-time setup screen appears instead; create an administrator with the setup token in that private file. Port 3002 is used on this machine because port 3000 may already be occupied. If 3000 is available, `npm run dev` uses that port by default.

To stop the app, press **Ctrl+C** in the app terminal. To stop PostgreSQL without deleting its data, run `docker compose stop`. Start it again with `docker compose up -d`. Do not use `docker compose down -v` unless you intentionally want to erase the local database volume and all data.

### Fresh clone or another computer

1. Install Node.js 20.9+ and Docker Desktop, then clone the repository.
2. In the repository folder, create the local environment file and edit the setup token:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Set `SETUP_TOKEN` to a private random value of at least 24 characters. Keep AI variables blank until you choose a provider. `.env` is ignored by Git.
3. Start Docker Desktop and run `docker compose up -d` to start PostgreSQL.
4. Run `npm ci`, then `npm run db:deploy` to install packages and apply the committed schema migration.
5. Run `npm run dev -- --port 3002` and open `http://localhost:3002`.
6. On the first setup screen, create the first administrator using the same token from `.env`. Choose and store a strong password. The server hashes it; the app will not show it again.
7. Download the Excel template under **Data import**, fill it with anonymized data, validate, apply, then generate the target month's draft.

The local Docker PostgreSQL service listens on port 5432 and stores data in the named `rosterly_postgres` volume. Docker Desktop provides PostgreSQL, so a separate PostgreSQL installation is not required. If using a separately managed PostgreSQL server, set `DATABASE_URL` in the ignored `.env` to that database's connection string instead.

## 13. Useful commands

| PowerShell command | Purpose |
| --- | --- |
| `docker compose up -d` | Start local PostgreSQL |
| `docker compose ps` | Check local database container status |
| `docker compose logs -f postgres` | View local PostgreSQL logs |
| `npm ci` | Install the exact dependency versions from the lock file |
| `npm run dev -- --port 3002` | Run local development app on port 3002 |
| `npm run typecheck` | Run the TypeScript compiler check |
| `npm run lint` | Run ESLint |
| `npm run build` | Generate Prisma Client and create a Next.js production build |
| `npm start` | Run the generated standalone app after a build |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:studio` | Open Prisma Studio to inspect local database records |
| `npm run import:template` | Regenerate the blank workbook at `docs/rosterly-workforce-template.xlsx` |
| `npm run demo:workbook` | Regenerate the clearly labeled synthetic workbook at `docs/demo-workforce-workbook.xlsx` |

After the app starts, `/api/health` is a quick database readiness check. The recorder is at [http://localhost:3002/recording-studio.html](http://localhost:3002/recording-studio.html). It asks the browser for screen/tab permission, optionally captures a microphone, previews the recording, and downloads a WebM file locally. The app does not upload or store that video.

## 14. Production deployment

The checked-in production Compose file runs the app and a one-shot database migrator; it does not run a production PostgreSQL server. Configure a managed PostgreSQL service and a host that supports Docker Compose or Next.js, then provide `DATABASE_URL` and a private `SETUP_TOKEN` using the host's secret manager. Configure optional AI variables there as well. For Docker deployment, use a private `.env.production` file and run:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

Set `APP_PORT` if host port 3000 is busy. Put the service behind HTTPS, configure backups and monitoring for the database, and use `/api/health` as a readiness probe. After initial administrator setup, rotate or remove the bootstrap token according to the host's secret-management process. Do not deploy the local database credentials.

No production host, database account, public URL, TLS certificate, or production credential has been configured in this repository. Deployment and the assessment video are still separate steps.

## 15. Known limits and planned operational work

- The planner is greedy and deterministic. It does not guarantee a globally optimal, fairest roster for complex constraints.
- Planning currently runs inside the web request; large workforces may need a background job queue and query/pagination tuning.
- The project has not been configured against the user's actual workforce workbook because none was available. Synthetic data must be identified as synthetic during a presentation.
- Real deployment requires a selected host, managed database, HTTPS, backups, secret handling, and host-specific verification.
- The current account interface creates users but does not provide complete user lifecycle controls such as password reset or account deactivation.
- Process and skill constraints should be confirmed against the real operation before using generated schedules for staffing decisions.

For the assessment design discussion, see [APPROACH.md](../APPROACH.md). For the suggested product walkthrough, see [DEMO_SCRIPT.md](../DEMO_SCRIPT.md), and for outstanding submission work see [SUBMISSION_CHECKLIST.md](../SUBMISSION_CHECKLIST.md).
