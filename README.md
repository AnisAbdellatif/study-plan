# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 4 of the assessment: accounts and a server, on top of the plan checks, what-if solver and deadlines.

- `apps/api`: Hono API on Bun with Better Auth (e-mail and password, e-mail verification, password reset) and Drizzle. Plans are stored per account as validated JSON documents with a revision number, so edits from another device are detected. Includes self-service data export and account deletion.
- `apps/web`: React app. Works without an account in the browser; after signing in, the plan can be saved to the account and stays in sync across devices. Impressum and Datenschutzerklärung pages read the operator's details from build-time configuration.
- `packages/shared`: Zod schemas, the grade engine with exact integer arithmetic, plan validation, the what-if solver and deadline logic.
- `presets/`: Technische Informatik B.Sc. at Leibniz Universität Hannover and a fictional example. `presets.lock.json` and `CHANGELOG.md` make every preset change deliberate.

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
