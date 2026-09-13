import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { mergeImportResults, parseGradeImport } from './grade-import.ts'
import { createPlanFromPreset } from './plan.ts'

const luh = presetSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../examples/luh-technische-informatik-bsc-2026.json', import.meta.url), 'utf8'),
  ),
)

const plan = createPlanFromPreset(luh, {
  id: 'plan',
  startTerm: { season: 'winter', year: 2026 },
  now: new Date('2026-09-13T10:00:00Z'),
})

describe('parseGradeImport with English transcripts', () => {
  const transcript = [
    'Exam no.\tModule\tGrade\tStatus\tECTS',
    '1001\tProgrammieren I\t\tpassed\t5',
    '1002\tGrundlagen digitaler Systeme\t2.3\tpassed\t5',
    '1003\tMathematik für die Ingenieurwissenschaften I\t5.0\tfailed\t8',
    '1003\tMathematik für die Ingenieurwissenschaften I\t3.7\tpassed\t8',
    '1004\tMathematik für die Ingenieurwissenschaften II\t1.7\tpassed\t8.0 ECTS',
    'Date 15.02.2027 Rechnerarchitektur',
  ].join('\n')

  const rows = parseGradeImport(transcript, plan)
  const byLine = (line: number) => rows.find((row) => row.line === line)

  it('reads grades with a decimal point and English pass markers', () => {
    expect(byLine(1)).toMatchObject({ status: 'no_result' })
    expect(byLine(2)).toMatchObject({ status: 'matched', moduleCode: 'GI-PROG1', result: { kind: 'passed' } })
    expect(byLine(3)).toMatchObject({ moduleCode: 'GI-GDS', result: { kind: 'graded', grade: 2.3 } })
    expect(byLine(4)).toMatchObject({ moduleCode: 'GM-MATHE1', result: { kind: 'graded', grade: 5 } })
    expect(byLine(6)).toMatchObject({ moduleCode: 'GM-MATHE2', result: { kind: 'graded', grade: 1.7 } })
  })

  it('does not read dates or credit values as grades', () => {
    expect(byLine(7)).toMatchObject({ status: 'no_result' })
  })

  it('reads "not passed" and "did not pass" as failed', () => {
    const [notPassed, didNotPass, failedGraded] = parseGradeImport(
      'Programmieren I not passed\nProgrammieren I did not pass\nGrundlagen digitaler Systeme not passed',
      plan,
    )
    expect(notPassed).toMatchObject({ status: 'matched', moduleCode: 'GI-PROG1', result: { kind: 'failed' } })
    expect(didNotPass).toMatchObject({
      status: 'matched',
      moduleCode: 'GI-PROG1',
      result: { kind: 'failed' },
    })
    expect(failedGraded).toMatchObject({ moduleCode: 'GI-GDS', result: { kind: 'graded', grade: 5 } })
  })

  it('keeps the best of several attempts', () => {
    const matched = rows.flatMap((row) =>
      row.status === 'matched' && row.moduleCode && row.result
        ? [{ moduleCode: row.moduleCode, result: row.result }]
        : [],
    )
    expect(mergeImportResults(matched, plan).get('GM-MATHE1')).toEqual({ kind: 'graded', grade: 3.7 })
  })

  it('still reads German markers', () => {
    const [passed, failed] = parseGradeImport(
      'Programmieren I bestanden\nProgrammieren I nicht bestanden',
      plan,
    )
    expect(passed).toMatchObject({ result: { kind: 'passed' } })
    expect(failed).toMatchObject({ result: { kind: 'failed' } })
  })
})
