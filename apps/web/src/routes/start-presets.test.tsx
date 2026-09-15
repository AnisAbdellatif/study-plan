import { createPlanFromPreset, presetSchema } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import example from '../../../../packages/shared/examples/informatik-bsc-example.json'
import type { PresetSummary } from '../lib/api.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

const ROW_ID = '5b0c1a52-8f3e-4c1e-9a55-0c6f2d7e9b10'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const summaries: PresetSummary[] = [
  {
    id: ROW_ID,
    universityName: example.university.name,
    programmeName: example.programme.name,
    degree: 'bsc',
    poVersion: example.poVersion,
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: '7d1e2f30-1111-4222-8333-944455566677',
    universityName: 'Leibniz Universität Hannover',
    programmeName: 'Maschinenbau',
    degree: 'msc',
    poVersion: 'PO 2023',
    updatedAt: '2026-09-01T10:00:00Z',
  },
]

function mockPresets(list: () => Response = () => respond({ presets: summaries })) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url === '/api/presets') return list()
    if (url === `/api/presets/${ROW_ID}`) return respond({ preset: { ...example, id: `preset/${ROW_ID}` } })
    return respond({ error: 'not_found' }, 404)
  })
}

function renderStart({ withPlan = false } = {}) {
  const store = createGuestStore(window.localStorage)
  if (withPlan) {
    store.replacePlan(
      createPlanFromPreset(presetSchema.parse(example), {
        id: 'existing',
        startTerm: { season: 'winter', year: 2025 },
        now: new Date('2026-09-01T10:00:00Z'),
      }),
    )
  }
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/start'] }))} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('choosing a preset on the start page', () => {
  it('filters with the keyboard, previews the preset and creates a plan from it', async () => {
    mockPresets()
    const { store, user } = renderStart()
    const section = await screen.findByRole('region', { name: 'Studiengang auswählen' })
    const combobox = await within(section).findByRole('combobox', { name: 'Studiengang suchen' })
    expect(combobox).toHaveAttribute('aria-expanded', 'false')

    await user.click(combobox)
    expect(combobox).toHaveAttribute('aria-expanded', 'true')
    const listbox = within(section).getByRole('listbox')
    expect(combobox).toHaveAttribute('aria-controls', listbox.id)
    expect(within(listbox).getAllByRole('option')).toHaveLength(2)

    await user.type(combobox, 'hannover master')
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Maschinenbau M.Sc.')
    expect(options[0]).toHaveTextContent('Leibniz Universität Hannover · PO 2023')

    await user.clear(combobox)
    await user.type(combobox, 'beispiel')
    expect(combobox).not.toHaveAttribute('aria-activedescendant')
    await user.keyboard('{ArrowDown}')
    const active = within(listbox).getByRole('option', { name: /Informatik B\.Sc\./ })
    expect(combobox).toHaveAttribute('aria-activedescendant', active.id)
    await user.keyboard('{Enter}')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')

    expect(await within(section).findByText('Die Antwort passt')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Plan anlegen' }))
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(store.getState().plan?.preset.id).toBe(`preset/${ROW_ID}`)
  })

  it('selects with a click, closes with Escape and points to the other options', async () => {
    mockPresets()
    const { user } = renderStart()
    const section = await screen.findByRole('region', { name: 'Studiengang auswählen' })
    const combobox = await within(section).findByRole('combobox')

    await user.click(combobox)
    await user.keyboard('{Escape}')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{ArrowUp}')
    expect(combobox).toHaveAttribute('aria-expanded', 'true')

    await user.type(combobox, 'gibt es nicht')
    expect(within(section).getByText('Kein Studiengang passt zu deiner Suche.')).toBeVisible()

    await user.clear(combobox)
    await user.click(within(section).getByRole('option', { name: /Informatik/ }))
    expect(combobox).toHaveValue(`Informatik B.Sc., ${example.university.name}, ${example.poVersion}`)
    expect(await within(section).findByText('Die Antwort passt')).toBeInTheDocument()
    expect(
      within(section).getByText(
        'Dein Studiengang ist nicht dabei? Lade eine Studiengangsdatei oder erstelle sie mit einem Sprachmodell, beides in den Reitern oben.',
      ),
    ).toBeInTheDocument()
  })

  it('replaces an existing plan only after confirmation', async () => {
    mockPresets()
    const { store, user } = renderStart({ withPlan: true })
    const section = await screen.findByRole('region', { name: 'Studiengang auswählen' })
    await user.click(await within(section).findByRole('combobox'))
    await user.click(within(section).getByRole('option', { name: /Informatik/ }))
    await user.click(await within(section).findByRole('button', { name: 'Plan anlegen' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Bestehenden Plan ersetzen?' })
    expect(store.getState().plan?.id).toBe('existing')
    await user.click(within(dialog).getByRole('button', { name: 'Ersetzen' }))
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(store.getState().plan?.preset.id).toBe(`preset/${ROW_ID}`)
  })

  it('says so when there are no presets yet', async () => {
    mockPresets(() => respond({ presets: [] }))
    renderStart()
    expect(await screen.findByText('Noch sind keine Studiengänge hinterlegt.')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Studiengang auswählen' })
    expect(within(section).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps the other options working when the list cannot be loaded', async () => {
    mockPresets(() => respond({ error: 'internal_error' }, 500))
    const { user } = renderStart()
    expect(
      await screen.findByText(/Die Studiengänge konnten gerade nicht geladen werden/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Datei' }))
    expect(await screen.findByRole('region', { name: 'Studiengang aus Datei laden' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Mit KI' }))
    expect(await screen.findByRole('button', { name: 'Prompt erstellen' })).toBeInTheDocument()
  })
})
