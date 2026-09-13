## What changes

<!-- One or two sentences. For presets: university, programme, PO version. -->

## Checks

- [ ] `bun run lint`, `bun run typecheck` and `bun run test` pass

### Only for preset changes

- [ ] Sources are linked in `notes` with their date or version: Prüfungsordnung, Modulhandbuch, Studienverlaufsplan
- [ ] Credits per area and in total match the Prüfungsordnung
- [ ] The grade calculation follows the PO paragraph cited in `notes` (weights, rounding, best-of or Streichregeln)
- [ ] Attempt limits, retakes and withdrawal deadlines come from the PO, or are left out
- [ ] `codesAreOfficial` is `false` if the module codes were made up
- [ ] A new PO version is a new file with a `transitions` entry from the previous one, not an edit of the old file
- [ ] `presets/CHANGELOG.md` has an entry and `bun run presets:lock` was run
- [ ] I study this programme or have checked the preset against a real transcript (say which in the description)
