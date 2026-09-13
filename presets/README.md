# Presets

A preset describes one programme under one Prüfungsordnung: its modules, areas, grade calculation and exam rules.
Students pick one when they create a plan, and the plan keeps a copy. Getting a preset wrong gives students a wrong
Durchschnittsnote, so every value needs a source.

## Adding a programme

1. Open an issue with the "Studiengang vorschlagen" form, so nobody else starts the same preset.
2. Create the skeleton: `bun run presets:new <university>/<programme>-<po-year>`, e.g. `tum/informatik-bsc-2024`.
   The id must match the file path.
3. Fill in the file from the official documents. Your editor validates it against `preset.schema.json` as you type.
4. Run `bun run presets:validate`. It rejects the file until every `TODO` is gone.
5. Add an entry to `CHANGELOG.md`, run `bun run presets:lock` and open a pull request. The template has a checklist.

The best reviewer is a student of the programme: check the finished preset against a real Notenspiegel.

## Starting from an LLM extraction

The app can generate a prompt that extracts a preset from a PO and a Modulkatalog (start page, "add your own programme"). The downloaded result is a good first draft for a contribution, but LLMs make mistakes, especially in the grade calculation. Check every value against the documents as described below before opening a pull request, replace the generated `custom/…` id with `<university>/<programme>-<po-year>`, and move the file to the matching path.

## Sources

Use the versions that apply to the students the preset is for, and name them with their date in `notes`:

- Prüfungsordnung (PO) and its amendments: credits, grade calculation, attempts, withdrawal deadlines
- Modulhandbuch or Modulkatalog: module names, credits, turnus, prerequisites
- Studienverlaufsplan: the typical semester of each module

Where the documents disagree, follow the PO and write down the conflict in `notes`. Write down every simplification
too, e.g. "Proseminar is one placeholder for any Proseminar".

## Modelling rules

- `modules[].name` is copied verbatim from the Modulhandbuch.
- Set `codesAreOfficial` to `false` when the university publishes no module codes and you made them up. The app
  then hides them.
- `grading: "pass_fail"` for unbenotete modules; `countsTowardAverage: false` for graded modules the PO excludes.
- `requiresCredits` for minimum credits before a module, e.g. 120 for a Bachelorarbeit. The board forecasts when
  the student reaches them.
- `gradeRules.aggregation` mirrors the PO paragraph on the Gesamtnote: `factor: 2` for a double-weighted thesis,
  `roundResult` for truncated Fachnoten, `dropWorst` for a Streichregel, `keepBest` for "the best modules up to
  N credits". `packages/shared/src/presets/luh-technische-informatik.test.ts` shows how to pin such rules in tests.
- `gradeRules.allowedValues` lists every grade a module can end up with. Include composite values like 1.2 when
  module grades are means of several exams, and list the exam steps in `standardGrades`.
- `modules[].details` holds descriptive Modulkatalog facts (people, languages, SWS, workload, exam forms, requirements, content, literature, other fields). They are optional and never used for calculations; copy texts verbatim.
- `examRules` only with a PO paragraph behind each value: `withdrawalDaysBeforeExam`, `maxAttempts` (including
  the first attempt), `retakePassedExams`, `supplementaryExamOnLastAttempt`. `modules[].maxAttempts` overrides
  the limit for a single module.

## Changing a preset

Students have plans based on the preset. When the bundled preset changes, the board offers them the update and
keeps their results where they still fit.

- Corrections to the same PO (a wrong credit value, a new elective): edit the file, add a CHANGELOG entry, run
  `bun run presets:lock`. CI fails when a preset changes without a new lock.
- Never rename a module code in place: students would lose the result. If a code was wrong, keep it or add a new
  PO file with a transition.
- A new Prüfungsordnung is a new file, e.g. `luh/technische-informatik-bsc-2030.json`. Keep the old file: students
  who started under it still need it.

## PO transitions

A new PO file can declare how plans move over from the previous one. Students then get "Prüfungsordnung
wechseln" in the board menu, and new plans only offer the newest PO.

```json
"transitions": [
  {
    "fromPresetId": "luh/technische-informatik-bsc-2026",
    "moduleMap": [{ "from": "GI-PROG1", "to": "GI-PROG" }],
    "notes": "Übergangsregelung laut § 24 PO 2030: …"
  }
]
```

Modules with the same code in both files carry over without an entry. `moduleMap` is for modules that continue
under a new code, one to one; results carry over when the grading still fits. Everything else follows the preset
update rules: new modules land unplanned, dropped modules with a result stay in the plan without counting.
Mappings that need a decision by the Prüfungsamt (two old modules for one new one, partial recognition) do not
belong in `moduleMap`; describe them in `notes`. `presets:validate` checks the mapped codes against the old file.
`example/informatik-bsc-example-2027.json` is a complete example.
