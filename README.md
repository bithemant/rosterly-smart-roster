# Rosterly — Smart Roster Management

Rosterly is a shared monthly planning workspace for multi-brand operations teams. It keeps workforce records and operating rules in PostgreSQL, produces versioned roster drafts, validates changes, and gives each account access only to its role and scope.

The application contains no bundled employee names, sample workspaces, or fake roster assignments. Load anonymized source data using the workbook template before generating a roster.

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

The Excel template is available at `/api/import/template`. Its sheets are `Pods`, `Employees`, `Brands`, `Processes`, `ProcessRules`, `Eligibility`, `Availability`, and `Holidays`. `ReadMe` explains the headers and formats. IDs in `externalKey` columns must stay consistent across sheets. Weekdays accept names or ISO numbers (`Mon=1` through `Sun=7`), dates use `YYYY-MM-DD`, and process times use 24-hour `HH:MM`. Set a brand or process `active` value to false to exclude it from new roster plans; omitted records are retained.

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

For a Docker host, the `Dockerfile` builds a small standalone Next.js runtime image and a separate `migrator` target. Build both from the same commit, run the migrator with the production `DATABASE_URL` before rollout, then start the runtime image on port `3000`:

```bash
docker build --target migrator -t rosterly-migrator .
docker run --rm --env-file .env.production rosterly-migrator
docker build --target runner -t rosterly .
docker run --rm --env-file .env.production -p 3000:3000 rosterly
```

Keep `.env.production` outside the repository and use the hosting platform’s secret store where available. The app image does not start PostgreSQL; point it at a separately managed PostgreSQL service.

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

## Assessment notes

- The planner is deterministic and prioritizes constrained processes, lower monthly workload, primary eligibility, and preferred off days. It is a greedy planner, not a mathematical optimizer.
- Preferred weekly off days may be overridden to meet client coverage and are shown as warnings. Mandatory off days, approved availability, overlaps, and capacity are hard scheduling constraints.
- Generation can leave open slots when the eligible workforce is insufficient. Managers see those gaps and must resolve them before publication.
- AI suggestions never modify assignments, approve leave, or publish a roster.
- See [APPROACH.md](APPROACH.md) for the assessment answers and trade-offs, and [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a recording walkthrough.
- See [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) for the remaining host, data, recording, and profile details before submission.

## Source document

The feature scope follows the supplied AI Internship Assessment PDF. See the assessment document for the exact assignment context.
