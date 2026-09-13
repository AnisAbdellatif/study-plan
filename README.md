# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 3 of the assessment, on top of the guest board and the grade engine.

- `presets/luh/`: Technische Informatik B.Sc. at Leibniz Universität Hannover, built from the PO in force from WS 2026/27 and the Modulkatalog WS 2026/27. `presets/example/` holds a fictional preset used in tests.
- Plan checks: modules planned in a term they are not offered in, missing prerequisites, not enough credits before a module such as the Bachelorarbeit, and areas below their minimum or above their maximum. Warnings show on the card and in a hints panel.
- What-if: pick a target grade and see which average the open planned modules need, computed with the real grade rules.
- Deadlines: enter exam dates per module to see upcoming exams and withdrawal deadlines, and export them as an iCalendar file.
- `apps/web`: React app, no account needed. Data stays in the browser's local storage with JSON export and import.
- `packages/shared`: Zod schemas, the grade engine with exact integer arithmetic, and pure plan operations.

## Requirements

- Bun 1.4.2
- Node 24 is optional and only used by CI to keep the runtime fallback working.

## Commands

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run lint
bun run presets:validate
bun run presets:schema
bun run build
```

## How grades are computed

Grade rules are data in each preset, not code. The engine in `packages/shared/src/engine/compute.ts` supports:

- credit-weighted or fixed-proportion aggregation, nested to any depth
- per-module weight factors, such as a double-weighted thesis
- truncation, round-half-up, or rounding to the nearest allowed grade, per group and for the final grade
- a Streichregel that drops the worst modules up to a credit budget
- best or latest attempt selection, with ungraded and excluded modules never entering the average

Every result carries a trace that explains which modules counted and why.
