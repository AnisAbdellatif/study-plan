import { createPlanFromPreset, type Plan, setModuleResult, summarizePlan } from '@study-plan/shared'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { examplePreset } from '../../test/fixtures.ts'
import { GradeCalculation } from './grade-calculation.tsx'

function planWithGrades(grades: Record<string, number>): Plan {
  let plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  for (const [code, grade] of Object.entries(grades)) {
    plan = setModuleResult(plan, code, { kind: 'graded', grade })
  }
  return plan
}

const renderCalculation = (plan: Plan) =>
  render(<GradeCalculation plan={plan} overall={summarizePlan(plan).overall} />)

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

describe('grade calculation explanation', () => {
  it('shows only counted grades with grade × weight, the division, rounding and the final grade', () => {
    renderCalculation(planWithGrades({ 'INF-101': 1.3, 'INF-102': 2.0, 'MAT-101': 2.7, 'MAT-102': 1.7 }))

    expect(screen.getByText(/gewichteter Durchschnitt/)).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Grundlagen der Programmierung/ })
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Grundlagen der Programmierung', '1,3', '8', '10,4'])
    expect(screen.getByText('66 ÷ 34 = 1,941')).toBeInTheDocument()
    expect(screen.getByText('Dieser Bereich geht mit 1,9 in die weitere Rechnung ein.')).toBeInTheDocument()

    // Areas without grades say so instead of listing every open module.
    expect(
      screen.getByText('In diesem Bereich hast du noch keine benotete Prüfung bestanden.'),
    ).toBeInTheDocument()
    expect(screen.getByText('4 weitere Module zählen (noch) nicht')).toBeInTheDocument()
    expect(screen.getByText('1 weiteres Modul zählt (noch) nicht')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'So ergibt sich die Gesamtnote' })).toBeInTheDocument()
    expect(screen.getByText(/dein Schnitt ist 1,9\./)).toBeInTheDocument()
  })

  it('explains what will appear before any grade counts', () => {
    renderCalculation(planWithGrades({}))
    expect(screen.getByText(/Sobald du eine benotete Prüfung bestanden hast/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
