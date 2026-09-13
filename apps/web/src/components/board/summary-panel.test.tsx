import { addPlaceholder, createPlanFromPreset, summarizePlan } from '@study-plan/shared'
import { render, screen } from '@testing-library/react'
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
