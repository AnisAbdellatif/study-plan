import { addPlaceholder, createPlanFromPreset, setModuleResult, summarizePlan } from '@study-plan/shared'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { luhPreset } from '../../test/fixtures.ts'
import { SummaryPanel } from './summary-panel.tsx'

describe('area summary', () => {
  it('shows earned / planned (required range), counting placeholder estimates as planned', () => {
    const plan = addPlaceholder(
      createPlanFromPreset(luhPreset, {
        id: 'plan-test',
        startTerm: { season: 'winter', year: 2026 },
        now: new Date('2026-09-13T10:00:00Z'),
      }),
      'vertiefung-informatik',
      's5',
      0,
      'test',
    )
    render(<SummaryPanel plan={plan} summary={summarizePlan(plan)} />)

    expect(screen.getByText('erreicht / geplant (Soll)')).toBeInTheDocument()
    const row = screen.getByText('Vertiefung der Informatik').closest('li')
    expect(row).toHaveTextContent('0 / ≈5 (10–20)')
    expect(screen.getByText('Vertiefung der Informationstechnik').closest('li')).toHaveTextContent(
      '0 / 0 (10–20)',
    )
  })
})

describe('grade calculation card', () => {
  it('sits next to the other cards and opens the worked calculation in a dialog', async () => {
    const base = createPlanFromPreset(luhPreset, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    const graded = base.modules.find((module) => module.grading === 'graded')
    if (!graded) throw new Error('expected a graded module')
    const plan = setModuleResult(base, graded.code, { kind: 'graded', grade: 2.0 })
    render(<SummaryPanel plan={plan} summary={summarizePlan(plan)} />)
    const user = userEvent.setup()

    const overview = screen.getByRole('complementary', { name: 'Überblick' })
    const card = within(overview)
      .getByRole('heading', { name: 'So wird dein Schnitt berechnet' })
      .closest('section')
    if (!card) throw new Error('expected the calculation card')
    expect(card).toHaveTextContent('Schritt für Schritt nachgerechnet')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Rechnung ansehen' }))
    const dialog = await screen.findByRole('dialog', { name: 'So wird dein Schnitt berechnet' })
    expect(within(dialog).getByText(/gewichteter Durchschnitt/)).toBeInTheDocument()
  })
})
