/**
 * Creates a preset skeleton: `bun run presets:new <university>/<programme>-<po-year>`.
 * Every "TODO" must be replaced before `presets:validate` accepts the file.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ALLOWED_GRADES } from '../src/schema/rules.ts'

const id = process.argv[2] ?? ''
const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id)
if (!match) {
  console.error('Usage: bun run presets:new <university>/<programme>-<po-year>, e.g. tum/informatik-bsc-2024')
  process.exit(1)
}
const [, university, programme] = match as unknown as [string, string, string]

const presetsDir = fileURLToPath(new URL('../../../presets/', import.meta.url))
const file = join(presetsDir, `${id}.json`)
if (existsSync(file)) {
  console.error(`${relative(process.cwd(), file)} already exists`)
  process.exit(1)
}

const skeleton = {
  $schema: `${relative(dirname(file), join(presetsDir, 'preset.schema.json'))}`,
  schemaVersion: 1,
  id,
  university: { slug: university, name: 'TODO: official name of the university' },
  programme: { slug: programme, name: 'TODO: programme name without degree', degree: 'bsc' },
  poVersion: 'TODO: e.g. PO 2024',
  handbookVersion: 'TODO: e.g. Modulhandbuch WS 2024/25',
  standardSemesters: 6,
  totalCredits: 180,
  creditLabel: 'ECTS',
  codesAreOfficial: true,
  examRules: {},
  notes:
    'TODO: Sources with links and dates (PO, Modulhandbuch, Studienverlaufsplan), and every simplification.',
  gradeRules: {
    allowedValues: DEFAULT_ALLOWED_GRADES,
    passThreshold: 4.0,
    attemptSelection: 'best',
    finalRounding: { mode: 'truncate', precision: 1 },
    aggregation: {
      id: 'gesamtnote',
      label: 'Gesamtnote',
      weightMode: 'credits',
      children: [{ kind: 'module', code: 'TODO-1' }],
    },
  },
  modules: [
    {
      code: 'TODO-1',
      name: 'TODO: module name as in the Modulhandbuch',
      credits: 5,
      grading: 'graded',
      countsTowardAverage: true,
      category: 'TODO',
      offering: 'winter',
      typicalSemester: 1,
    },
  ],
  areas: [],
}

mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, `${JSON.stringify(skeleton, null, 2)}\n`)
console.log(`created ${relative(process.cwd(), file)}. Read presets/README.md next.`)
