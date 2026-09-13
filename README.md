# Study Plan

A web platform for students at German universities to plan their modules across semesters and track grades.
See [project.md](project.md) for the brief and [assessment.md](assessment.md) for the architecture decisions.

## Status

Milestone 1 of the assessment: the grade engine.

- `packages/shared`: Zod schemas for presets and grade rules, and a pure grade engine using exact integer arithmetic.
- `presets/`: study-programme presets as JSON, validated in CI. The only preset so far is a fictional example.

## Requirements

- Bun 1.4.2
- Node 24 is optional and only used by CI to keep the runtime fallback working.

## Commands

```bash
bun install
bun run test
bun run typecheck
bun run lint
bun run presets:validate
bun run presets:schema
```

## How grades are computed

Grade rules are data in each preset, not code. The engine in `packages/shared/src/engine/compute.ts` supports:

- credit-weighted or fixed-proportion aggregation, nested to any depth
- per-module weight factors, such as a double-weighted thesis
- truncation, round-half-up, or rounding to the nearest allowed grade, per group and for the final grade
- a Streichregel that drops the worst modules up to a credit budget
- best or latest attempt selection, with ungraded and excluded modules never entering the average

Every result carries a trace that explains which modules counted and why.
