# Assessment of the Study Planner Brief

## 1. Overall verdict

**Sound.** Semester board plus grade tracking for German degrees, one self-hosted Postgres, Docker, tests and CI are the right shape for a solo developer. Guest-first planning with a later account is proven (eibens/studienplaner).

**Underspecified.** The single "average" hides the real work: Prüfungsordnungen differ in weighting, truncation, thesis weight, exclusions and admissible grade set. A generic "Informatik" preset cannot exist; a preset is university plus Studiengang plus PO version plus Modulhandbuch version. "6 semesters / 180 LP" is a default (DHBW: 210 LP in six; 7-semester FH Bachelors exist). Sharing and grades sit side by side with no separation. Exam reminders have no machine-readable source.

**Three biggest risks.**
1. A wrong Gesamtnote destroys trust. Rules as data, integer arithmetic, truncation, golden tests per PO.
2. Preset upkeep is the dominant recurring cost; a solo maintainer cannot track dozens of programmes. Two presets from your own university plus a community path.
3. Legal and operational overhead for one person: Impressum, AVVs, GDPR self-service, tested backups, and a fast-moving auth dependency.

Correction to a common assumption: grades are not Art. 9 special-category data, but Art. 5(1)(c) and Art. 25 still justify keeping plan and record separate.

## 2. Recommended stack

| Layer | Pick | Alternative | Why |
|---|---|---|---|
| Runtime | Bun 1.4.x pinned as `oven/bun:1.4.2` (never `latest`), `bun apps/api/src/index.ts`; code kept Node-portable; Node 24 CI job mandatory | Node 24 LTS as a base-image swap (`node src/index.ts`, type stripping on by default, erasable syntax only) | One binary for runtime, install, scripts and bundling. Bun 1.4.1 shipped a same-day regression (https://bun.com/blog/bun-v1.4.2), so pin the tag and keep the fallback honest. MIT, owned by Anthropic since 2 Dec 2025 (https://bun.com/blog/bun-joins-anthropic) |
| Package manager | Bun workspaces (`apps/web`, `apps/api`, `packages/shared`), committed `bun.lock`, `bun ci` (equals `bun install --frozen-lockfile`) in CI, `[install] minimumReleaseAge = 604800` in bunfig.toml | npm workspaces with `package-lock.json` only if you ever leave Bun | One toolchain, one lockfile; never commit both `bun.lock` and `package-lock.json` |
| Frontend | React 19.3, Vite 8, TanStack Router (pinned, quarterly upgrades), TanStack Query 5 | Vue 3.5, shadcn-vue, Unovis | Prior fluency decides; the margin is narrow |
| UI | Tailwind 4.3, shadcn on Base UI, dark mode via `prefers-color-scheme` tokens | shadcn-vue on reka-ui | Copied-in components: no upstream breakage lands automatically |
| Architecture | Vite SPA plus Hono 4.13 API, one image, Hono serves the static build; `serveStatic` from `hono/bun` isolated in one entry file per runtime (`@hono/node-server/serve-static` for the fallback) | Nuxt 4 if Vue | Login-gated, no SEO, SSR buys nothing |
| API contract | Hono RPC `hc<AppType>`, `@hono/standard-validator`, Zod 4 | oRPC 1.x | Zero codegen; `@hono/zod-openapi` later for the share endpoint |
| ORM | Drizzle 0.45.x pinned, postgres.js, `generate` + `migrate`, `--custom` SQL for triggers | Prisma 7.x (pin CLI and client separately) | SQL migration files are the durable asset; never `drizzle-kit push` |
| Database | PostgreSQL 18.6, `uuidv7()`; volume at `/var/lib/postgresql` | 19 after GA | Supported to Nov 2030; image layout changed (https://github.com/docker-library/postgres/issues/1370) |
| Auth | Better Auth 1.7.x, Drizzle adapter, email+password only, `requireEmailVerification: true`, `rateLimit.storage: 'database'`, passkeys optional | Hand-rolled sessions per Lucia guide | Vercel-owned since 7 Jul 2026 (https://vercel.com/blog/vercel-acquires-better-auth), high advisory cadence: wrap behind a thin interface |
| Sessions | Opaque DB sessions, `__Host-session`, cookieCache off, 30-day absolute lifetime with idle refresh, ID regeneration on login and password change, "überall abmelden" | none | JWTs cannot be revoked |
| Email | nodemailer 10 over SMTP behind `sendMail()`, Scaleway TEM, Mailpit locally | Resend/Postmark SDKs | Both store account data in the US (https://resend.com/docs/dashboard/domains/regions, https://postmarkapp.com/support/article/1218-gdpr-faq) |
| Jobs | pg-boss 12.x on the same Postgres | in-process SKIP LOCKED poller | Cron, retries, no Redis; claim, send, mark |
| Drag and drop | Pragmatic DnD 3.1 or @dnd-kit behind an adapter; "Verschieben nach Semester" menu mandatory | SortableJS 1.15 | Native HTML5 drag unproven on phones; test on real devices in week one |
| Charts | Recharts 3.x | ECharts 6 | Few hundred points; SVG is fine |
| i18n | i18next 26 (v26.4.2, https://github.com/i18next/i18next/releases), German source locale, English for UI chrome only | Paraglide 2.x | i18next: runtime loading, larger ecosystem; Paraglide: compile-time typed keys, smaller bundle, single-vendor project |
| Lint | Biome 2.5 | oxlint + oxfmt (native Tailwind class sorting) | Decide on class sorting first |
| Tests | Vitest 5 via `bun run test` (never `bun test`, which starts Bun's own runner), Playwright 1.63, testcontainers 12; the Vitest job also runs on Node 24 in CI | `bun test` for pure engine functions only | One mocking API, real Postgres; the Node job keeps the runtime fallback honest |
| Deploy | Actions to GHCR, Compose (app on `oven/bun:1.4.2` Debian slim, postgres:18, Caddy), Hetzner CX23 Falkenstein or Nuremberg, about 6 EUR/month (Sep 2026, list price changed Jun 2026), pgBackRest | Coolify | German data location, reversible |

**Bun or Node.** Decision: Bun 1.4.x is the production runtime and the single toolchain (install, scripts, bundling, Vitest runner). What makes this safe is portability, and it is a hard rule, not a preference: expose the app as a Web-standard fetch handler through Hono, use the postgres.js npm driver under Drizzle, and keep every Bun-only API out of the request path and data layer (no Bun.SQL, no Bun.serve route objects, no bun:sqlite, no `bun build --compile`). Pin the image tag, keep a Node 24 job in CI, and keep a second Dockerfile target on `node:24-slim` so the fallback is a base-image swap. The skeptics' counterargument stands and is accepted: Node 24 strips TypeScript natively (https://nodejs.org/docs/latest-v24.x/api/typescript.html), so Bun is chosen for the single toolchain and speed, not out of necessity. Bump the pinned tag deliberately, after reading the release notes, never by tracking `latest`.

**React or Vue.** Pick what you know. React has deeper third-party depth (Recharts, TanStack Router); Pragmatic DnD, Better Auth's client, Unovis and shadcn-vue make Vue equally complete. Default React with no prior preference. Avoid Next.js and TanStack Start because the app needs no SSR, not because they cannot be self-hosted.

## 3. Domain rules the app must get right

**Grade values.** Discrete values from the preset's `allowedValues[]`. Default 1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0; 0.7, 4.3, 4.7, 5.3 excluded (KIT SPO §7(2), Bielefeld BPO §14(1), https://www.uni-bielefeld.de/themen/pruefungsrecht/rahmenpruefungen/bpo/). DHBW point tables yield 1.1, 1.4 and failing 4.2 to 4.8, so `passed = grade <= 4.0` is derived. Store `numeric(2,1)` with `CHECK (grade BETWEEN 1.0 AND 5.0)`; the fine step set is preset data.

**Result kinds.** benotete Prüfungsleistung, unbenotete Studienleistung (bestanden only, unlimited repeats), anerkannt (usually ungraded), plus an independent `countsTowardAverage` flag: KIT ÜQ (6 LP), §15 Zusatzleistungen and §15a Mastervorzugsleistungen carry credits but never enter the Gesamtnote (https://www.informatik.kit.edu/downloads/info%20bsc%20spo%202015.pdf). Never treat "bestanden" as a grade.

**Weighted mean.** `sum(grade_i * credits_i * factor_i) / sum(credits_i * factor_i)`, per-module factor (0, 0.5, 1, 2), optional fixed-credit override, per-module weight from the catalogue, formula variant per PO. Integer arithmetic (grade tenths, credit halves) checked against a BigInt rational oracle.

**Rounding.** Default truncation to one decimal (KIT §7(4), Bonn, Bielefeld BPO §15, FernUni §19(4), DHBW Stuttgart). Modes: `truncate`, `round_half_up` (Bremen DPO'03, https://www.szi.uni-bremen.de/ufaqs/wie-erfolgt-die-notenberechnung/), `round_to_nearest_allowed_ties_better` (FernUni §17(5), https://www.fernuni-hagen.de/mi/studium/pdf/pobscinf.pdf); precision 1 or 2. Never `Math.round` or `toFixed`.

**Aggregation.** Recursive node {members or children, weight mode credits | fixed_fraction | fixed_credits | per_module_override, truncate after, cap_credits striking overflow from the worst module, drop_worst {max_credits, eligible groups, within Regelstudienzeit}, select best child}. Depth 1 is the v1 UI path; KIT Fachnoten, Münster fractions 15/161, 40/161, 6/161 (https://www.uni-muenster.de/imperia/md/content/wwu/ab_uni/ausgabe22/beitrag03e.pdf) and Mainz Nebenfach caps come via presets. Contested: the original finding wanted a mandatory three-level tree; most POs go module to Gesamtnote directly, so keep the recursion but expose it only via presets.

**Attempts.** Each attempt is a row with a kind (first, repeat, oral_supplementary, improvement, free_attempt, recognition) and a result (registered, passed, failed, absent, withdrawn). Effective grade per PO rule (`best` or `latest`); never enforce "one passed attempt" (Notenverbesserung exists). Max attempts and the 4.0 cap on a mündliche Nachprüfung (KIT §9) are preset rules. Failed attempts keep their real value and contribute nothing.

**Fachsemester.** Each plan semester has a kind with a Fachsemester weight: Vollzeit 1, Teilzeit 0.5, Urlaub 0, Ausland 1; `fachsemester = plans.fachsemester_override ?? sum(weights of preceding semesters)`. Every milestone rule (Orientierungsprüfung, GOP, BAföG §48, KIT nine-semester distinction limit) reads this number.

**Plan validation.** Tree of areas with [min,max] credits, checked per area and in total. Per-semester load warns below `rules.load_warn_min` (default 20) and above `rules.load_warn_max` (default 36) LP. Modules under 5 LP warn only (TUM Kolloquium is 3). Modules carry Turnus, required vs recommended prerequisites and a recommended Fachsemester; the board warns on wrong parity or a prerequisite placed later. Semesters carry Vorlesungszeit and Prüfungszeitraum end dates. A multi-semester module places Teilleistungen (`plan_module_parts`) per column while credits and grade attach to the module.

**Two-university example.**
- KIT B.Sc. Informatik SPO 2015: Theoretische Informatik 18, Praktische 38, Technische 12, Mathematik 38 to 45, Wahlbereich 25 to 32, Ergänzungsfach 21, ÜQ 6 (excluded), Bachelorarbeit 15 LP double weight; Gesamtnote is the LP-weighted mean of truncated Fachnoten; distinction if thesis 1.0, average at most 1.2, at most nine semesters; Orientierungsprüfung (Programmieren, Grundbegriffe der Informatik, Lineare Algebra I or LA und Analytische Geometrie I) by the end of the second semester's Prüfungszeitraum; thesis from 120 LP (§14).
- TUM B.Sc. Informatik FPSO 2012/2016: Pflicht Informatik 89, Mathematik 36, Wahl 10, Überfachliche Grundlagen 9, Anwendungsfach 21, thesis 12 plus Kolloquium 3; credit-weighted with GOP modules IN0001, IN0004, IN0015 at 50 percent; at least one GOP module by semester two; 75 further credits before the thesis (https://www.cit.tum.de/cit/studium/studiengaenge/bachelor-informatik/fpso-2012-fassung-von-2016-1/).

## 4. Feature suggestions

**Must**
- Guest mode with `schemaVersion` and export nudges: Safari deletes script-writable storage after seven days of Safari use without interaction on the site (https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); "Sichern" creates the account.
- Board: mobile one semester per screen with scroll-snap and a semester tab strip, current semester scrolled into view; tablet two or three columns; desktop all columns in an `overflow-x` container.
- Accessibility: the "Verschieben nach Semester" menu is the single non-drag path (WCAG 2.2 SC 2.5.7): focusable cards, Enter opens, Escape closes, German aria-live announcement. Directional arrow-key dragging is rejected (Atlassian advises against it). Counterargument: dnd-kit's KeyboardSensor gives it free, but two paths double the test surface.
- Rules-as-data engine, pure function with explanation trace.
- Three numbers: running average, projected official Gesamtnote, what-if solver. Contested: module.org ships a solver on mobile; differentiate on web, self-hosting, PO awareness.
- ECTS progress: earned, planned, required; thesis as its own block.
- Attempt rows from day one; remaining-attempt warnings.
- Preset scoping (university, programme, PO, handbook), snapshot-on-fork, diff-on-update.
- Plan and record as separate aggregates; share serializer never emits grades.
- "Nächste Fristen" list: Abmeldefristen from exam dates plus preset offsets, thesis deadlines, milestone rules; same data feeds .ics.
- Onboarding: preset or empty, Studienbeginn, editable Fachsemester, charts hidden until two graded semesters.
- JSON export/import (backup, Art. 20, preset contribution).

**Should**
- Wahlpflicht as area budgets; Turnus and prerequisite warnings; thesis eligibility forecast; "mit Auszeichnung" predicate.
- BAföG §48 marker at Fachsemester 4, editable threshold; Notenstreichung and Zusatzleistung flags.
- Unlisted revocable structure-only links, "In meine Pläne kopieren" only.
- CSV/paste import; print stylesheet; .ics export.
- German vocabulary, module names verbatim from the handbook, per-preset credit label, de-DE formatting with `roundingMode: 'trunc'`.
- Anerkannt state, linked Bachelor and Master plans, PO switch with Äquivalenz mapping.

**Could**
- Email reminders via pg-boss from exam dates plus Abmeldefrist offsets; milestones secondary. Contested: milestone-only reminders fire twice per degree.
- Two charts; manual dark-mode toggle; PWA and Web Push (iOS needs Home Screen install; works in the EU after Apple's reversal, https://techcrunch.com/2024/03/01/apple-reverses-decision-about-blocking-web-apps-on-iphones-in-the-eu/); grade history panel.

**Defer or drop**
- Public directory; push in v1; campus integrations; HISinOne PDF parser before three samples; ECTS letter grades; cohort comparisons; in-app preset editor; column-level grade encryption (optional hardening).

## 5. Proposed MVP and milestones

1. **Engine (weeks 1 to 2).** `packages/shared`: Zod preset and rules schemas, `computeOverall`, fast-check properties, golden tests from current KIT and TUM POs.
2. **Guest board (weeks 2 to 4).** One preset, move menu, responsive board, grade entry writing one attempt row per grade (single field in the UI, policies later), running average, ECTS bars, localStorage with schema version, JSON export/import. Touch DnD on real phones.
3. **Second preset and validation (week 5).** Technische Informatik sharing the Grundlagen catalogue; area budgets, Turnus and prerequisite warnings, what-if solver, Nächste Fristen list, .ics export.
4. **Accounts (weeks 6 to 8).** Hono API, Drizzle migrations, Better Auth with email verification, "Sichern", Art. 15/17/20 self-service, Impressum and Datenschutzerklärung, Dockerfile on `oven/bun:1.4.2` with a `node:24-slim` target, Compose on Hetzner, pgBackRest with first restore drill, preset hash check in CI.
5. **Sharing and import (weeks 9 to 10).** Verified email required; unlisted structure-only links with copy-on-fork, CSV/paste import, print PDF, preset diff-on-update UI.
6. **After one semester with ten users.** Email reminders, community preset PRs, attempt policies, thesis eligibility, PO switch, automated deploys.

## 6. Data model sketch

| Table | Key columns |
|---|---|
| universities | id uuidv7, slug, name, term dates, Anmelde-/Abmeldefrist offsets |
| programme_versions | university_id, slug, degree_type, po_version, handbook_version, standard_semesters, total_credits, credit_label, grade_rules jsonb (incl. load_warn_min/max), content_hash, valid_from/until |
| modules | university_id, code (unique per university), name, credits numeric(4,1) half-integer CHECK, grading, offering, weight_override null, retired_at |
| programme_version_modules | programme_version_id, module_id, category, typical_semester |
| module_groups, module_group_members, module_prerequisites | aggregation node config; prerequisite kind; CHECK module <> requires |
| users, sessions, accounts, verification | Better Auth (text ids); user_profiles: display_name, default university |
| plans | user_id, programme_version_id null, start_term_key, fachsemester_override null, forked_from_plan_id ON DELETE SET NULL, source_content_hash, target_grade, deleted_at |
| plan_semesters | plan_id, seq, kind regular/part_time/leave/abroad, fachsemester_weight; term derived |
| plan_modules | plan_id, plan_semester_id (primary), module_id null, snapshotted name/credits/grading/category, counts_toward this/other/none, position; unique(plan_id, module_id) where not null |
| plan_module_parts | plan_module_id, plan_semester_id, name, credits null, weight; Teilleistungen spanning columns |
| exam_attempts | plan_module_id, plan_module_part_id null, attempt_no (unique pair), term_year, term_season, exam_date, grade null, kind enum, result enum |
| grade_events | exam_attempt_id, action, before/after jsonb, at; user by join, no FK |
| shares | plan_id, token hashed 128-bit, allow_fork, expires_at, revoked_at; no visibility column in v1 |
| reminders | user_id, plan_module_id, kind, due_at, notify_at, claimed_at, attempts, sent_at, canceled_at |

**Shared catalogue.** University-level modules plus `programme_version_modules` from day one, because the two named presets share the Grundlagen block and migrating provenance keys later rewrites every plan. Counterargument: per-programme rows are simpler and one code namespace per university can collide; accept the join.

**Preset storage.** JSON files under `presets/<university>/<programme>-<po-year>.json` with a `$schema` key for editor validation, validated in CI by the shared Zod schema (`z.toJSONSchema()`, transform-free), seeded idempotently. JSON over YAML because the brief asks for it, the browser guest mode and the Art. 20 export use the same schema with no parser dependency; the cost is no comments (use a `notes` field) and no anchors. Versioning: content_hash plus git date; CI fails when a hash changes without a changelog entry; a new PO is a new preset; an Änderungsordnung is a flagged amendment offered as a recommended update. Contested: PRs assume GitHub-literate contributors, so also promote curated shared plans to placement presets.

## 7. Security, privacy and legal checklist

- Legal bases: Art. 6(1)(b) service, 6(1)(a) optional features, 6(1)(f) security logs; Nutzungsbedingungen at sign-up; 16-year Art. 8 threshold.
- Impressum (§5 DDG, ladungsfähige Anschrift), Datenschutzerklärung with all Art. 13 items and retention periods, Art. 30 Verzeichnis, 72-hour Art. 33 runbook, security.txt.
- AVV with Hetzner and an EU mail processor; do not rely on the DPF (appeal C-703/25 P pending, https://digitalpolicyalert.org/event/35459-latombe-filed-appeal-against-general-court-dismissal-of-challenge-to-european-unionunited-states-data-protection-framework-adequacy-decision-in-latombe-v-commission).
- Self-service Art. 15/17/20; CSV cells starting with =, +, -, @ escaped; deletion via Better Auth `deleteUser`.
- No consent banner: one `__Host-session` cookie, no third-party scripts or fonts, strict CSP, server-side log analysis only. Contested: cookieless Umami still reads device attributes.
- Passwords: Argon2id via `Bun.password.hash(pw, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 })` (memoryCost in kibibytes, PHC string output, https://bun.com/docs/runtime/hashing) wired to Better Auth's `password.hash/verify` behind a one-file `hashPassword()` interface; the Node fallback swaps in `node:crypto` `argon2()` (Node 24.7+, https://nodejs.org/en/blog/release/v24.7.0) with the same parameters, and because both sides speak the PHC format existing hashes keep verifying; 8 to 128 chars; uniform reset and sign-up responses; hashed single-use tokens; per-IP and per-target-email limits with `rateLimit.storage: 'database'`; ALTCHA if a bot check is needed (https://github.com/altcha-org/altcha).
- Email verification required before sharing or reminders; fresh authentication for email change and deletion.
- Zod on every route; grade validated against the preset set; ownership helper with a user-B-gets-404 test; reorder endpoint re-checks module ownership.
- Share hardening: `<meta name="robots" content="noindex">` on `/share/:token`, per-IP rate limit on `/share/*` in Caddy, display name only.
- Four Compose secrets at `/run/secrets`: DB password (rotate: restart app), Better Auth secret (rotate: logs everyone out), grade-encryption key if ever used (needs re-encrypt job by key-id), SMTP key (rotate freely).
- Encryption at rest: LUKS2 (aes-xts-plain64) on a Hetzner Volume for `/var/lib/postgresql`, keyfile on the root disk; this covers disk disposal and snapshot theft, not host compromise. Counterargument: application-level grade encryption needs no boot unlock but adds a key and a rotation job; column encryption stays optional.
- Backups: pgBackRest with `repo-cipher-type=aes-256-cbc`, `repo-type=sftp` to a Hetzner Storage Box (https://pgbackrest.org/configuration.html), 30-day retention, monthly restore into a scratch container. pgBackRest over nightly pg_dump because it gives WAL point-in-time recovery and encrypted repos; pg_dump remains the simpler alternative if PITR is not wanted.
- Docker bypasses UFW: bind Postgres and app to the Compose network; non-root, read-only root, `cap_drop ALL`; separate app and migration DB roles.
- pino redact list; Caddy `ip_mask`; logs 7 to 30 days; inactive accounts purged after 24 months; reminder mails carry module and date only, List-Unsubscribe.

## 8. Testing and CI/CD plan

- Engine: fast-check properties (bounds, permutation, pass/fail, monotonicity, all-equal, BigInt oracle); golden cases per PO.
- Preset CI: Zod validation, area sums, hash-without-changelog check, retired-not-deleted.
- Unit and component: Vitest 5 via `bun run test` on `oven/bun:1.4.2`, plus the same job on Node 24 so the runtime fallback stays honest.
- Integration: testcontainers postgres:18 for migrations, pg-boss, Better Auth sign-up, verification, login, reset, revocation, uniform responses; gates Renovate patch auto-merge.
- E2E: Playwright against the built image; move-menu path cross-browser, drag path Chromium-only.
- Security: IDOR 404 test, share snapshot without grade fields, CSV escaping.
- Pipeline v1: lint and format, tests, `bun audit --audit-level=high --prod` (https://bun.com/docs/pm/cli/audit), image build to GHCR on tag (pm-02 defers CI/CD beyond lint and tests; overruled because self-hostability needs a reproducible image and it costs an hour). Deploy by manual `docker compose pull` by digest with a one-shot migration container. Deferred: automated deploys, weekly Trivy rebuilds.
- Supply chain: `bun ci` (frozen lockfile), `[install] minimumReleaseAge = 604800` (7 days, in seconds) with `minimumReleaseAgeExcludes` for `@types/*` and `typescript` in bunfig.toml, Renovate `minimumReleaseAge: '7 days'` with `vulnerabilityAlerts` immediate, Actions pinned to SHAs.

## 9. Open questions for the author

1. Which university and PO versions, and can you obtain the current SPO and Modulhandbuch for both presets?
2. React or Vue fluency today?
3. Will you publish your name and address, use a c/o service, or found a Verein?
4. Bun is decided. Will the Node 24 CI job be required or advisory, and who bumps the pinned Bun tag and how often?
5. EU mail provider DPA and SPF/DKIM/DMARC on your own domain before accounts?
6. Is the what-if solver or the board the headline?
7. Hours per semester for preset upkeep, and a co-maintainer at your university?
8. Teilzeit and Urlaubssemester visible in v1?
9. Germany-only, or should the rules object anticipate Austrian and Swiss scales?
10. Manual entry plus CSV paste as the only import for the first year?