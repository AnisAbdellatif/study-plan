# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 6 of the assessment, with programme data extracted by each student's own LLM instead of bundled presets: exam attempts, thesis admission, plan updates for new POs, e-mail reminders, on top of sharing, grade import and accounts.

- Exam attempts: every module keeps its attempts, including no-shows and withdrawals. Presets define attempt limits and whether passed exams can be retaken, and the board warns before the last attempt and when attempts run out.
- Thesis admission: for modules with a credit requirement, such as the Bachelorarbeit, the board shows the credits earned and forecasts the semester in which the plan reaches them.
- E-mail reminders: opt-in on the account page. 3 days before the last withdrawal day and 7 days before an exam, with module names and dates only, a one-click unsubscribe header and an unsubscribe page.
- `apps/api`: Hono API on Bun with Better Auth and Drizzle; plans per account with revisions; share links; reminders; data export and account deletion.
- `apps/web`: React app that works without an account and syncs with one.
- `packages/shared`: Zod schemas, the grade engine, plan validation, attempts, what-if solver, deadlines, grade import, programme extraction and plan updates.

## Requirements

- Bun 1.4.2
- PostgreSQL 16 or newer in production. Development and tests use embedded PGlite.
- Node 24 is optional and only used by CI to keep the runtime fallback working.

## Commands

```bash
bun install
bun run dev              # API on :3000 and web app on :5173 (Vite forwards /api)
bun run test
bun run typecheck
bun run lint
bun run build
bun run db:generate      # SQL migration after changing apps/api/src/db/schema.ts
```

In development the API uses an embedded PGlite database in `apps/api/.data/` and prints e-mails, including verification links, to its console. No database server or mail server is needed.

## Configuration

API (`apps/api`, environment variables):

- `NODE_ENV`: `production` enforces the required settings below.
- `DATABASE_URL`: `postgres://user:password@host:5432/db` in production. `pglite://<directory>` for an embedded database.
- `PUBLIC_URL`: the address students open, e.g. `https://plan.example.org`. E-mail links and secure cookies derive from it.
- `BETTER_AUTH_SECRET`: at least 32 random characters, e.g. from `openssl rand -base64 32`. Changing it signs everyone out.
- `SMTP_URL` and `MAIL_FROM`: mail delivery for verification and password reset e-mails.
- `WEB_DIST`: path to `apps/web/dist` to serve the web app from the API process.
- `IP_ADDRESS_HEADER`: behind a reverse proxy that sets it, e.g. `x-forwarded-for`, so rate limiting sees client IPs.
- `PORT`: defaults to 3000.
- `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` (at least 10 characters), optional `SUPERADMIN_NAME`: the superadmin account, required in production. On the first start the API creates it as a verified account; if an account with that address already exists, it is promoted instead and keeps its password. Once a superadmin exists these values are ignored, so change the password through "Forgot password" afterwards. In development they default to `admin@example.com` / `development-admin-password`.
- Admin dashboard at `/admin`, for accounts with the admin or superadmin role; everyone else gets a 404. It shows account and usage numbers but never grades or plan contents, and logs every action. Admins manage student accounts. The superadmin additionally creates admins, grants and removes admin rights, and deletes admin accounts. Exactly one superadmin exists (enforced by the database); nobody can delete, demote, sign out or otherwise act on it, including the superadmin itself.
- `REMINDER_INTERVAL_MINUTES`: how often the API checks for due reminder e-mails, default 60. `0` turns the reminder job off, e.g. when a second API process runs next to the first. Reminders are claimed in the database before sending, so parallel runs never send one twice.

Migrations run automatically when the API starts.

Web app, read at build time (GitHub repository variables for the CI image, or `apps/web/.env.production.local` locally): `VITE_OPERATOR_NAME`, `VITE_OPERATOR_STREET`, `VITE_OPERATOR_POSTAL_CITY`, `VITE_OPERATOR_EMAIL`, optional `VITE_OPERATOR_PHONE`, `VITE_HOSTING_PROVIDER`, `VITE_MAIL_PROVIDER`. Until they are set, the Impressum and Datenschutzerklärung show marked gaps and a warning.

Before publishing:

1. Set the operator details above and check both legal pages. They are a starting point, not legal advice.
2. Conclude data processing agreements (Art. 28 DSGVO) with the hosting provider and the mail provider.
3. The Datenschutzerklärung states that no access logs with IP addresses are kept: the host's Caddy writes no access log and the API logs no IP addresses. If you add access logging (in Caddy, a reverse proxy in front of it, or the API), update the policy.

## Deployment

The `Dockerfile` builds one image: the API, which also serves the built web app. `deploy/compose.yaml` runs it on a VPS together with PostgreSQL. Caddy runs on the host itself, obtains the HTTPS certificates and forwards each domain to its app, which Compose publishes on `127.0.0.1` only (`deploy/Caddyfile` is a reference configuration). PostgreSQL is only reachable from the app container.

Branches: changes go to `dev` first and reach `main` through pull requests, usually several at once. Protect `main` in the repository settings (Settings → Branches: require a pull request and the CI checks).

Every push to `main` or `dev` runs the checks. When they pass, CI builds the image and pushes it to `ghcr.io/<owner>/<repository>`, copies the stack definition to the VPS over SSH, pulls the image and restarts with `docker compose up --wait`. A failing health check fails the deploy.

| Branch | Image tags | VPS directory | Stack | Address |
|---|---|---|---|---|
| `main` | `latest`, `<sha>` | `DEPLOY_PATH` (`/opt/study-plan`) | `deploy/compose.yaml`: app, PostgreSQL; `127.0.0.1:3000` | `DOMAIN` |
| `dev` | `dev`, `dev-<sha>` | `DEV_DEPLOY_PATH` (e.g. `/opt/study-plan-dev`) | `deploy/compose.dev.yaml`: app, PostgreSQL; `127.0.0.1:3001` | dev domain |

The dev stack has its own database, `.env` and superadmin, and never touches the production image tags or containers. Both stacks publish their app on a different loopback port (`APP_PORT` in each `.env`), and the host's Caddy forwards each domain to its port; the dev domain answers 502 while the dev stack is down. CI never touches the host's Caddy configuration. Dev deploys are skipped until `DEV_DEPLOY_PATH` is set.

One-time setup:

1. On the VPS: install Docker with the compose plugin and Caddy, create a deploy user in the `docker` group, create the directory (default `/opt/study-plan`) and put a filled-in copy of `deploy/.env.example` there as `.env`. Adapt `deploy/Caddyfile` to your domains in `/etc/caddy/Caddyfile` and run `sudo systemctl reload caddy`. Point the domain at the VPS and open ports 80 and 443.
2. In the GitHub repository, under Settings → Secrets and variables → Actions:
   - Variables: `DEPLOY_HOST`, `DEPLOY_USER`, optional `DEPLOY_PORT` (22) and `DEPLOY_PATH` (`/opt/study-plan`), plus the `VITE_OPERATOR_*` variables above, which are compiled into the web app.
   - Secrets: `DEPLOY_SSH_KEY` (a private key whose public key is in the deploy user's `authorized_keys`) and `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan -p <port> <host>`).
   The deploy job is skipped until `DEPLOY_HOST` is set; the image is still built.
3. After the first deploy, sign in with `SUPERADMIN_EMAIL` and change the password.
4. For the dev stack: add a DNS record and a site block in the host's Caddyfile for the dev domain, create the directory (e.g. `/opt/study-plan-dev`, owned by the deploy user), put a filled-in copy of `deploy/dev.env.example` there as `.env` with its own passwords and secret, and set the repository variable `DEV_DEPLOY_PATH`. The next push to `dev` deploys it.

Each deploy tags the image it pulled as `latest` (or `dev`) on the VPS, so `docker compose up -d` in the stack's directory restarts the deployed version without logging in to the registry. Rolling back: `docker compose pull` is not needed; run `APP_TAG=<older commit sha> docker compose up -d` if that image is still on the VPS (unused images are removed after two weeks), otherwise revert the commit and push. Back up the database with `docker compose exec postgres pg_dump -U studyplan studyplan > backup.sql`.

Building locally: `docker build -t study-plan .`

## Programme data

Students get the data for their programme in one of three ways on the start page: they pick a preset maintained by admins, load a programme file (`programme.json`) they already have, or build the file with an LLM.

### Presets

Admins manage presets in the "Vorlagen" section of the admin dashboard. A preset is a programme file, validated with `parseCustomPreset` exactly like a file loaded on the start page, and stored whole in the `preset` table (`document` column). University, programme, degree and PO version come from the file and are unique together; uploading a second file for the same combination answers 409, so admins replace the existing preset instead.

- Public routes, no account needed: `GET /api/presets` lists `{ id, universityName, programmeName, degree, poVersion, updatedAt }` sorted by university and programme; `GET /api/presets/:id` returns `{ preset }`.
- Admin routes: `POST /api/admin/presets` with the programme file as the request body, `PUT /api/admin/presets/:id` replaces the data, `DELETE /api/admin/presets/:id`. Invalid files answer 400 `{ error: 'invalid_preset', reason, issues }`. These routes accept bodies up to 5 MB, since files with full Modulkatalog details can exceed the general 1 MB limit.
- The preset's own `id` is `preset/<row uuid>`, set by the server regardless of the file. It stays the same when an admin replaces the data, so plans (which store `preset.id`) keep pointing at their preset. Plans carry their own copy of the programme data, so replacing or deleting a preset never changes an existing plan.
- On the start page, "Studiengang auswählen" offers a searchable combobox (`apps/web/src/components/presets/`): every word typed must match the university, programme, degree or PO version.

### Building a programme file with an LLM

1. They enter the university, programme, degree and optionally the PO version.
2. The app generates a prompt (`buildExtractionPrompt` in `packages/shared/src/custom-preset/prompt.ts`). The student gives it to an LLM of their choice together with the Prüfungsordnung and the Modulkatalog. The app itself never contacts an LLM.
3. The student pastes the answer. `parseCustomPreset` finds the JSON, validates it against the programme schema (`packages/shared/src/schema/preset.ts`) and shows either the problems (with a follow-up message for the LLM) or a preview.
4. A plan is created from the result.

The prompt asks for everything the planner uses: modules with credits, grading, offering, recommended semester, prerequisites and credit requirements, areas, exam rules (withdrawal deadline, attempts, retakes, supplementary exam) and the grade calculation as an aggregation tree. It also asks for the Modulkatalog details of every module (people, languages, SWS and courses, workload, exam forms, requirements, learning outcomes, content, literature and any other catalog field), shown on the board under "Moduldetails". The prompt embeds the JSON Schema generated from the Zod schema at runtime, so it follows schema changes automatically. It is written in English because models follow English instructions most reliably; extracted names and texts stay in the documents' language.

When the PO or the Modulkatalog changes, the student updates the plan from the board menu: the app generates the prompt again with the plan's current module codes, the LLM keeps those codes for modules that continue, and the student sees which modules are added, removed or changed before applying the update. Grades, placements and exam dates are kept wherever they still fit.

Visitors who want to look around first can open a demo plan from a fictional programme. The example programmes in `packages/shared/examples/` serve the demo and the tests; the LUH file there is a real PO used to test the grade engine.

## Choice areas and custom modules

Programmes often let students pick a few modules from a long list (one Proseminar out of many, 10 to 20 LP of Vertiefung, Studium Generale). The planner treats these as choice areas:

- An area is a choice area when its modules are marked `elective`, or when it has a credit maximum and lists more credits than that. Modules without a recommended semester, and modules whose semester group exceeds the maximum, are the options; a compulsory module of the same area that fits keeps its semester (`choiceOptionCodes` in `packages/shared/src/plan/placeholders.ts`).
- Options start unplanned and are not listed one by one. The unplanned column shows one tile per choice area with the chosen credits and placeholders. Students drag a tile into a semester (or use its menu) to place a placeholder, then pick the module for it from a searchable list.
- A placeholder counts with the most common credit value of its options for semester load, area minimums and the thesis admission forecast, never for grades. Moving a placeholder out of the semesters removes it; a chosen module can turn back into a placeholder.
- Resetting a plan removes placeholders; programme updates keep placeholders whose area still exists.

Students can also add their own modules (name, credits, graded or not, counting toward the average, area, offering). Graded modules that count are added to the top level of the grade calculation, weighted by credits, when the programme's calculation weights by credits; special rules such as best-of selections do not apply to them. Custom modules are kept through resets and programme updates.

## Languages

The web app is available in German and English; e-mails follow the language of the account.

- Language: the choice saved in the browser, otherwise the browser language (German for German browsers, English for all others). The footer switches it. Signed-in students' choice is stored on the account (`user.locale`) and used for verification, password reset and reminder e-mails.
- Messages live in `apps/web/src/i18n/locales/<locale>/<namespace>.ts`. German is the reference; each English file is typed `satisfies Messages<typeof de>`, so a missing or extra key fails `bun run typecheck`. Keys are type-checked in `t(...)`.
- Every new page or component takes its text from these files, including aria labels, announcements and error messages. Numbers, grades and dates go through `apps/web/src/lib/format.ts`.
- Preset data (module names, areas, PO versions) stays in the language of the official documents.
- The German Impressum and Datenschutzerklärung are binding; the English versions are courtesy translations.
- Routes and query parameters are English (`/sign-in`, `/account?verified=1`, `/shared/$token`, `/unsubscribe`, ...).
- Web tests render German by default; switch with `await i18n.changeLanguage('en')`.

## How grades are computed

Grade rules are part of each programme's data, not code. The engine in `packages/shared/src/engine/compute.ts` supports:

- credit-weighted or fixed-proportion aggregation, nested to any depth
- per-module weight factors, such as a double-weighted thesis
- truncation, round-half-up, or rounding to the nearest allowed grade, per group and for the final grade
- a Streichregel that drops the worst modules up to a credit budget
- best or latest attempt selection, with ungraded and excluded modules never entering the average

Every result carries a trace that explains which modules counted and why.
