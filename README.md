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
- `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` (default `anthropic/claude-haiku-4.5`): the study assistant. Without a key it is off; admins also switch it off and set a daily message limit per account in the dashboard. The API sends the model only the programme data of a plan and the student's questions, never grades, results, exam dates, the target grade or account data, and routes only to providers that neither store nor train on prompts. Conversations are not stored.
- `REMINDER_INTERVAL_MINUTES`: how often the API checks for due reminder e-mails, default 60. `0` turns the reminder job off, e.g. when a second API process runs next to the first. Reminders are claimed in the database before sending, so parallel runs never send one twice.

Migrations run automatically when the API starts.

Web app, read at build time (GitHub repository variables for the CI image, or `apps/web/.env.production.local` locally): `VITE_OPERATOR_NAME`, `VITE_OPERATOR_STREET`, `VITE_OPERATOR_POSTAL_CITY`, `VITE_OPERATOR_EMAIL`, optional `VITE_OPERATOR_PHONE`, `VITE_HOSTING_PROVIDER`, `VITE_MAIL_PROVIDER`. Until they are set, the Impressum and Datenschutzerklärung show marked gaps and a warning.

Before publishing:

1. Set the operator details above and check both legal pages. They are a starting point, not legal advice.
2. Conclude data processing agreements (Art. 28 DSGVO) with the hosting provider and the mail provider.
3. The Datenschutzerklärung states that no access logs with IP addresses are kept: the host's Caddy writes no access log and the API logs no IP addresses. If you add access logging (in Caddy, a reverse proxy in front of it, or the API), update the policy.

## Deployment

The `Dockerfile` builds one image: the API, which also serves the built web app. [Kamal](https://kamal-deploy.org) runs it on a VPS together with PostgreSQL, and [deploy-kit](https://github.com/AnisAbdellatif/deploy-kit) (vendored in `.kamal/kit`, version in `.kamal/kit/VERSION`) adds the checks before a deploy, the smoke tests after it and the rollback. Caddy runs on the host itself, obtains the HTTPS certificates and forwards both domains to kamal-proxy on `127.0.0.1:8080`, which routes by domain to each app and swaps its container with no downtime (`deploy/Caddyfile` is a reference configuration). PostgreSQL publishes no port; only containers on the server reach it.

```
Internet ─443─► Caddy (host, TLS) ─► 127.0.0.1:8080 kamal-proxy ─► app ─► PostgreSQL (accessory)
```

Branches: changes go to `dev` first and reach `main` through pull requests, usually several at once. Protect `main` in the repository settings (Settings → Branches: require a pull request and the CI checks).

CI tests every push. For pushes to `main` and `dev`, once the checks pass, it builds the image, pushes it as `ghcr.io/anisabdellatif/study-plan:<commit sha>` and signs a build attestation. CI deploys nothing and holds no SSH key or app secret. A person deploys:

```bash
git switch dev && .kamal/kit/bin/kit deploy -d dev
git switch main && git pull && .kamal/kit/bin/kit deploy -d production
```

Before anything changes on the server, `kit deploy` checks that the deploy isn't frozen, that the checkout is on the destination's branch, clean and pushed, that CI passed for this exact commit (it waits up to 15 minutes for a run still going), and that the image was built and attested by this repository's CI workflow. Production also asks you to type its name. Kamal then pulls the image and starts the new container, and kamal-proxy moves traffic once `/api/health` answers. The app migrates the database on start, while the old container still serves. Finally the smoke tests check the public URLs through Caddy, and a failure rolls back to the previous version. A gate that refuses says how to go past it once, on purpose (`KIT_SKIP=<step> KIT_SKIP_REASON="…"`).

| Destination | Branch | Kamal config | Secrets on the VPS | Database | Address |
|---|---|---|---|---|---|
| `production` | `main` | `config/deploy.yml` + `config/deploy.production.yml` | `/opt/study-plan/app.env`, `postgres.env` | `study-plan-postgres` | study-plan.de |
| `dev` | `dev` | `config/deploy.yml` + `config/deploy.dev.yml` | `/opt/study-plan-dev/app.env`, `postgres.env` | `study-plan-dev-postgres` | dev.study-plan.de |

The dev destination has its own database, secrets and superadmin, and never touches production's containers. The kit's settings are in `.kamal/kit.env`; Kamal's run in the kit's image (`KIT_RUNNER=docker`), so the machine that deploys needs only bash, git, Docker and a logged-in `gh`.

One-time setup:

1. On the VPS: Docker and Caddy, and a deploy user in the `docker` group with your SSH key (`.kamal/kit/bin/kit host` can set up a fresh server). Create `/opt/study-plan` and `/opt/study-plan-dev`, owned by the deploy user, each with a filled-in `app.env` and `postgres.env` (`deploy/app.env.example`, `deploy/postgres.env.example`; `chmod 600`, no quotes around values). Point both domains at the VPS, put `deploy/Caddyfile` in `/etc/caddy/Caddyfile` and reload Caddy. Open only ports 22, 80 and 443.
2. In the GitHub repository, under Settings → Secrets and variables → Actions → Variables: the `VITE_OPERATOR_*` variables above, which are compiled into the web app. Nothing else: CI needs no deploy credentials.
3. On the machine that deploys: copy `.kamal/kit.local.env.example` to `.kamal/kit.local.env` and fill in the server (`SP_HOST`) and a GitHub token with only `read:packages` (`KAMAL_REGISTRY_PASSWORD`; the servers log in to ghcr.io with it). Then `.kamal/kit/bin/kit doctor -d production`.
4. For each destination, once: `.kamal/kit/bin/kit kamal accessory boot postgres -d <destination>`, then `kit deploy -d <destination>` as above. The first deploy also starts kamal-proxy.
5. After the first production deploy, sign in with `SUPERADMIN_EMAIL` and change the password.

Moving from the old compose stacks (once per destination; production shown, dev is the same with `/opt/study-plan-dev` and `study-plan-dev`). The database volume carries over, so no dump and restore is needed, but take a backup anyway:

1. Back up: `cd /opt/study-plan && docker compose exec postgres pg_dump -U studyplan studyplan > backup-$(date +%F).sql`.
2. Write `app.env` and `postgres.env` from the old `.env`: `DATABASE_URL=postgres://studyplan:<POSTGRES_PASSWORD>@study-plan-postgres:5432/studyplan`, and drop the quotes the old file needed around values with `$`.
3. Stop the stack but keep its volume: `docker compose down` (without `-v`). The site is down from here until step 5.
4. Boot the database on the same volume: `.kamal/kit/bin/kit kamal accessory boot postgres -d production`.
5. Point the domain's `reverse_proxy` in `/etc/caddy/Caddyfile` at `127.0.0.1:8080`, reload Caddy, and deploy: `.kamal/kit/bin/kit deploy -d production`.
6. When it works: remove the old `compose.yaml` and `.env` from `/opt/study-plan`, and the repository variables and secrets the old deploy job used (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`, `DEV_DEPLOY_PATH`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`), and remove its public key from the deploy user's `authorized_keys`.

Day to day:

- Rolling back: `.kamal/kit/bin/kit kamal rollback <older commit sha> -d production`. Kamal keeps the last few containers on the server.
- Stopping deploys: `.kamal/kit/bin/kit freeze -d production "reason"`, then `kit unfreeze -d production`.
- Logs and a shell: `.kamal/kit/bin/kit kamal app logs -d production`, `kit kamal app exec -i -d production sh`.
- Changed secrets in `app.env`: they take effect with the next deploy, or at once with `kit kamal app boot -d production`.
- Database backup: `ssh <server> docker exec study-plan-postgres pg_dump -U studyplan studyplan > backup.sql`.
- Updating deploy-kit: `.kamal/kit/bin/kit update --from https://github.com/AnisAbdellatif/deploy-kit --ref <tag>`, then review and commit the diff in `.kamal/kit`.

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
