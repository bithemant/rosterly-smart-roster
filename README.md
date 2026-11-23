# Rosterly — Smart Roster Management

Rosterly is a shared monthly planning workspace for multi-brand operations teams. It keeps workforce records and operating rules in PostgreSQL, produces versioned roster drafts, validates changes, and gives each account access only to its role and scope.

The application starts with an empty database and does not auto-seed workforce records. For the assessment walkthrough, an opt-in synthetic workbook uses generated operator IDs and fictional brand names. It is clearly labeled and must not be treated as real operational data. Replace it with your anonymized source data before operational use.

## Capabilities

- Deterministic monthly scheduling from process calendars, minimum coverage, eligibility, approved availability, holidays, weekly-off preferences, and daily capacity.
- Independent validation for coverage gaps, eligibility, leave, mandatory off days, overlapping shifts, and capacity limits.
- Draft versioning, manual assignment changes, audit events, and publication checks. A roster with blocking issues cannot be published.
- CSV and multi-sheet Excel import with a validation preview. Imports use stable external keys, update matching records, and retain records omitted from the workbook.
- Role-based access for administrators, operations managers, pod leads, and employees. Role and pod scope are checked on the server.
- Optional provider-switchable AI guidance through an OpenAI-compatible chat-completions endpoint. The key stays server-side; AI receives process-level summaries and cannot write to a roster.
- Responsive indigo-and-coral interface, CSV roster export, availability requests, and a private import history.

## Roles

| Role | Scope and permissions |
| --- | --- |
| Administrator | All pods; manage accounts, import data, generate and publish rosters, review requests, and make draft changes. |
| Operations manager | All pods; import data, generate and publish rosters, review requests, and make draft changes. |
| Pod lead | Own pod; review availability and edit draft assignments within the pod. |
| Employee | Own employee record and published roster; submit availability requests. |

Every protected API route enforces access on the server. The UI navigation is not treated as an authorization boundary.

## Local setup

### Requirements

- Node.js 20.9 or later
- npm
- Docker Desktop (or a PostgreSQL 14+ database you can connect to)

Docker Desktop runs PostgreSQL locally; you do not need to separately install PostgreSQL when Docker is available.

### Start the application

1. Open a terminal in the repository and create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Set `SETUP_TOKEN` in `.env` to a private random value of at least 24 characters. Leave `AI_API_KEY` empty until you choose an AI provider. Never commit `.env`.
3. Start Docker Desktop, then start PostgreSQL:

   ```powershell
   docker compose up -d
   ```

4. Install dependencies, create the database schema, and start Next.js:

   ```powershell
   npm ci
   npm run db:deploy
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).
5. Create the first administrator in the one-time setup screen with the same `SETUP_TOKEN` from `.env`. Setup closes after the first administrator is created.
6. Download the workbook template from **Data import**, fill it with anonymized source rows, validate, and apply it. Then generate a draft for the target month.

For an externally managed PostgreSQL database, set `DATABASE_URL` to its connection string. The host must allow environment variables and application connectivity over TLS as required by the provider.

## Data import format

Download the [blank Excel workbook](docs/rosterly-workforce-template.xlsx) for your data, or use **Data import** and `/api/import/template` after starting the app. Its sheets are `Pods`, `Employees`, `Brands`, `Processes`, `ProcessRules`, `Eligibility`, `Availability`, and `Holidays`. `ReadMe` explains the headers and formats. IDs in `externalKey` columns must stay consistent across sheets. Weekdays accept names or ISO numbers (`Mon=1` through `Sun=7`), dates use `YYYY-MM-DD`, and process times use 24-hour `HH:MM`. Set a brand or process `active` value to false to exclude it from new roster plans; omitted records are retained. Regenerate the blank workbook after changing its schema with `npm run import:template`.

If you do not have source data for the assessment demo, use the [clearly labeled synthetic December 2026 workbook](docs/demo-workforce-workbook.xlsx). It contains 30 pseudonymous operators, 30 fictional brands, five pods, varied calendars, shared-process staffing, weekly-off patterns, a trained backup allocation, two demo holidays, and one approved demo leave. State that this dataset is synthetic when you present it. Regenerate it with `npm run demo:workbook`.

The CSV template at `/api/import/template?format=csv` supports employee rows for pods that already exist in the database. CSV is not a substitute for the complete multi-sheet workbook on a new workspace.

Roster rows and names are stored in your configured database. Import previews retain a SHA-256 file hash and row counts; the uploaded row content is parsed again at commit and is not saved in import history. Use anonymized source data and keep database backups under your organization’s controls.

## AI configuration

Roster generation and validation work without AI. To enable the assistant, set these server environment variables and restart the app:

```env
AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="your-model-name"
AI_API_KEY="your-secret-key"
AI_PROVIDER_LABEL="Your provider"
```

Use any provider that implements the OpenAI-compatible `POST /chat/completions` interface. Only aggregate coverage and process-level issue summaries are sent. The assistant explains and suggests; the deterministic validator and manager approval control the roster.

## Production deployment

Deploy the Node.js application to a host that supports Next.js 16, environment variables, and a reachable PostgreSQL database. Before the first application start, provide `DATABASE_URL` and `SETUP_TOKEN`, then run the release migration:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm start
```

Configure `DATABASE_URL`, `SETUP_TOKEN`, `NODE_ENV=production`, and optionally AI variables in the host’s secret manager. Use managed PostgreSQL or a properly backed-up PostgreSQL server; do not expose the local Docker credentials from `compose.yaml`. Serve the app behind HTTPS so session cookies are secure. Set up database backups and rotate the setup token after initial setup.

Use `/api/health` as the host's readiness check. It returns HTTP 200 only when the app can reach PostgreSQL, and HTTP 503 otherwise. The production Docker image includes a health check against this route.

For a Docker host, `compose.production.yaml` builds the standalone Next.js runtime and a separate migrator. Create an ignored `.env.production` file containing `DATABASE_URL` for your managed PostgreSQL instance and a private `SETUP_TOKEN` with at least 24 characters. Optionally add the `AI_*` variables from `.env.example`. Compose waits for the migration container to finish successfully before starting the app:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

Keep `.env.production` outside the repository and use the hosting platform’s secret store where available. The production Compose file does not start PostgreSQL; point it at a separately managed PostgreSQL service. It publishes the app on host port `3000` by default; set `APP_PORT` in `.env.production` if that port is already in use. Place the app behind the host's HTTPS reverse proxy.

No deployment host was selected in this repository, so a live production URL and production database are not claimed here. The host-specific domain, TLS, and environment setup remain deployment steps.

## Project commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run typecheck` | TypeScript verification |
| `npm run lint` | ESLint |
| `npm run build` | Generate Prisma Client and build Next.js |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:migrate` | Create/apply a local development migration |
| `npm run db:studio` | Open Prisma Studio |
| `npm run import:template` | Regenerate the blank import workbook |
| `npm run demo:workbook` | Regenerate the clearly labeled synthetic demo workbook |

## Assessment notes

- The planner is deterministic and prioritizes constrained processes, lower monthly workload, primary eligibility, and preferred off days. It is a greedy planner, not a mathematical optimizer.
- Preferred weekly off days may be overridden to meet client coverage and are shown as warnings. Mandatory off days, approved availability, overlaps, and capacity are hard scheduling constraints.
- Generation can leave open slots when the eligible workforce is insufficient. Managers see those gaps and must resolve them before publication.
- AI suggestions never modify assignments, approve leave, or publish a roster.
- See [APPROACH.md](APPROACH.md) for the assessment answers and trade-offs, and [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a recording walkthrough.
- Open `/recording-studio.html` while the app is running to capture the selected browser tab locally and download a WebM recording.
- See [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) for the remaining host, data, recording, and profile details before submission.

## How the system works

1. **Data model:** PostgreSQL stores employees, pods, brands, processes, dated employee-to-process eligibility, operating rules, availability, and roster versions separately. This models employees working across multiple processes or brands without hard-coding a brand's staffing pattern.
2. **Generation and validation:** A deterministic planner fills required process-day slots using calendars, eligibility, availability, mandatory offs, shift overlap, and daily capacity. A separate validator recalculates coverage and conflicts; error-level issues block publication.
3. **Single-resource and shared brands:** Eligibility rows and each process's minimum staffing determine whether a process has one or several available resources. A brand can mix single-person and shared processes.
4. **Only resource unavailable:** The planner leaves a visible coverage gap when no eligible backup can work. It identifies the affected process, date, and missing headcount so a manager can add a trained backup or change the requirement.
5. **Conflicts:** Mandatory constraints are enforced; preferred weekly offs are soft and can be overridden to preserve client coverage, with a warning. Insufficient staffing stays an explicit issue instead of receiving an invalid assignment.
6. **Automation and control:** Generation, coverage calculation, validation, versioning, and issue summaries are automated. People maintain data, review leave, edit drafts, resolve conflicts, and publish. The optional AI assistant explains issues but cannot change a roster.
7. **If the team doubled:** The relational model and shared PostgreSQL database can hold more records. I would add pagination and query tuning, move long planning jobs to a worker queue, and evaluate a constraint solver for larger, tightly constrained schedules.
8. **One more week:** I would benchmark with representative anonymized data, add the team's real skills and shift constraints, compare full-month fairness with a solver, and finish host-specific backup and recovery procedures.

## Source document

The feature scope follows the supplied AI Internship Assessment PDF. See the assessment document for the exact assignment context.
