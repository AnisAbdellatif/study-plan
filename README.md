# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 2 of the assessment: the guest board, on top of the milestone 1 grade engine.

- `apps/web`: React app. Pick a preset and a start term, then plan modules across semesters by dragging or with each card's menu. Enter grades and see the running average, ECTS progress and area progress. Data stays in this browser's local storage and can be exported and imported as JSON. No account needed.
- `packages/shared`: Zod schemas for presets, grade rules and plans, the grade engine with exact integer arithmetic, and pure plan operations reused by the web app and later by the server.
- `presets/`: study-programme presets as JSON, validated in CI. The only preset so far is a fictional example.

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
