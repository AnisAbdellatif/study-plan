# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 6 of the assessment: exam attempts, thesis admission, PO switches, e-mail reminders and community presets, on top of sharing, grade import and accounts.

- Exam attempts: every module keeps its attempts, including no-shows and withdrawals. Presets define attempt limits and whether passed exams can be retaken, and the board warns before the last attempt and when attempts run out.
- Thesis admission: for modules with a credit requirement, such as the Bachelorarbeit, the board shows the credits earned and forecasts the semester in which the plan reaches them.
- PO switch: a newer preset can declare a transition from an older one. Students preview which modules carry over with their results, then switch; new plans only offer the newest PO.
- E-mail reminders: opt-in on the account page. 3 days before the last withdrawal day and 7 days before an exam, with module names and dates only, a one-click unsubscribe header and an unsubscribe page.
- Community presets: [presets/README.md](presets/README.md) explains sources and modelling, `bun run presets:new` creates a skeleton, and GitHub has an issue form and a pull request checklist.
- `apps/api`: Hono API on Bun with Better Auth and Drizzle; plans per account with revisions; share links; reminders; data export and account deletion.
- `apps/web`: React app that works without an account and syncs with one.
- `packages/shared`: Zod schemas, the grade engine, plan validation, attempts, what-if solver, deadlines, grade import, preset updates and PO switches.
- `presets/`: Technische Informatik B.Sc. at Leibniz Universität Hannover and two fictional example POs, guarded by `presets.lock.json` and `CHANGELOG.md`.

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
bun run presets:validate
bun run presets:check    # fails when a preset changed without updating presets.lock.json
bun run presets:lock
bun run presets:new tum/informatik-bsc-2024   # preset skeleton, see presets/README.md
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
- `REMINDER_INTERVAL_MINUTES`: how often the API checks for due reminder e-mails, default 60. `0` turns the reminder job off, e.g. when a second API process runs next to the first. Reminders are claimed in the database before sending, so parallel runs never send one twice.

Migrations run automatically when the API starts.

Web app (`apps/web/.env.production.local`, read at build time): `VITE_OPERATOR_NAME`, `VITE_OPERATOR_STREET`, `VITE_OPERATOR_POSTAL_CITY`, `VITE_OPERATOR_EMAIL`, optional `VITE_OPERATOR_PHONE`, `VITE_HOSTING_PROVIDER`, `VITE_MAIL_PROVIDER`, `VITE_SERVER_LOG_RETENTION`. Until they are set, the Impressum and Datenschutzerklärung show marked gaps and a warning.

Before publishing:

1. Set the operator details above and check both legal pages. They are a starting point, not legal advice.
2. Conclude data processing agreements (Art. 28 DSGVO) with the hosting provider and the mail provider.
3. Make sure the web server's own logs match the retention stated in the Datenschutzerklärung.

## How grades are computed

Grade rules are data in each preset, not code. The engine in `packages/shared/src/engine/compute.ts` supports:

- credit-weighted or fixed-proportion aggregation, nested to any depth
- per-module weight factors, such as a double-weighted thesis
- truncation, round-half-up, or rounding to the nearest allowed grade, per group and for the final grade
- a Streichregel that drops the worst modules up to a credit budget
- best or latest attempt selection, with ungraded and excluded modules never entering the average

Every result carries a trace that explains which modules counted and why.
