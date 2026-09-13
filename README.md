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
- `ADMIN_EMAILS`: comma-separated e-mail addresses of verified accounts that may open the admin dashboard at `/admin`. Everyone else gets a 404. The dashboard shows account and usage numbers but never grades or plan contents, and logs every action.
- `REMINDER_INTERVAL_MINUTES`: how often the API checks for due reminder e-mails, default 60. `0` turns the reminder job off, e.g. when a second API process runs next to the first. Reminders are claimed in the database before sending, so parallel runs never send one twice.

Migrations run automatically when the API starts.

Web app (`apps/web/.env.production.local`, read at build time): `VITE_OPERATOR_NAME`, `VITE_OPERATOR_STREET`, `VITE_OPERATOR_POSTAL_CITY`, `VITE_OPERATOR_EMAIL`, optional `VITE_OPERATOR_PHONE`, `VITE_HOSTING_PROVIDER`, `VITE_MAIL_PROVIDER`, `VITE_SERVER_LOG_RETENTION`. Until they are set, the Impressum and Datenschutzerklärung show marked gaps and a warning.

Before publishing:

1. Set the operator details above and check both legal pages. They are a starting point, not legal advice.
2. Conclude data processing agreements (Art. 28 DSGVO) with the hosting provider and the mail provider.
3. Make sure the web server's own logs match the retention stated in the Datenschutzerklärung.

## Programme data

There are no bundled programme presets. Every student builds the data for their own programme on the start page:

1. They enter the university, programme, degree and optionally the PO version.
2. The app generates a prompt (`buildExtractionPrompt` in `packages/shared/src/custom-preset/prompt.ts`). The student gives it to an LLM of their choice together with the Prüfungsordnung and the Modulkatalog. The app itself never contacts an LLM.
3. The student pastes the answer. `parseCustomPreset` finds the JSON, validates it against the programme schema (`packages/shared/src/schema/preset.ts`) and shows either the problems (with a follow-up message for the LLM) or a preview.
4. A plan is created from the result.

The prompt asks for everything the planner uses: modules with credits, grading, offering, recommended semester, prerequisites and credit requirements, areas, exam rules (withdrawal deadline, attempts, retakes, supplementary exam) and the grade calculation as an aggregation tree. It also asks for the Modulkatalog details of every module (people, languages, SWS and courses, workload, exam forms, requirements, learning outcomes, content, literature and any other catalog field), shown on the board under "Moduldetails". The prompt embeds the JSON Schema generated from the Zod schema at runtime, so it follows schema changes automatically. It is written in English because models follow English instructions most reliably; extracted names and texts stay in the documents' language.

When the PO or the Modulkatalog changes, the student updates the plan from the board menu: the app generates the prompt again with the plan's current module codes, the LLM keeps those codes for modules that continue, and the student sees which modules are added, removed or changed before applying the update. Grades, placements and exam dates are kept wherever they still fit.

Visitors who want to look around first can open a demo plan from a fictional programme. The example programmes in `packages/shared/examples/` serve the demo and the tests; the LUH file there is a real PO used to test the grade engine.

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
