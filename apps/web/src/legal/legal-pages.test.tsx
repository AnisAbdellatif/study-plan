import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

function renderAt(path: string) {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: [path] }))} />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

describe('legal pages', () => {
  it('shows the brand and a clear way back to the homepage', async () => {
    renderAt('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Study Plan' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Stand: September 2026')).toBeInTheDocument()
  })

  it('links every privacy section from the table of contents', async () => {
    renderAt('/privacy')
    const contents = await screen.findByRole('navigation', { name: 'Inhalt' })
    const link = within(contents).getByRole('link', { name: '3. Aufruf der Website' })
    expect(link).toHaveAttribute('href', '#website')
    expect(within(contents).getAllByRole('link')).toHaveLength(12)
    expect(within(contents).getByRole('link', { name: '8. Studienassistent' })).toHaveAttribute(
      'href',
      '#assistant',
    )
    expect(screen.getByRole('region', { name: '3. Aufruf der Website' })).toHaveAttribute('id', 'website')
  })

  it('states that no access logs with IP addresses are kept, without a retention placeholder', async () => {
    renderAt('/privacy')
    expect(await screen.findByText(/Wir führen keine Zugriffsprotokolle mit IP-Adressen/)).toBeInTheDocument()
    expect(screen.queryByText(/Speicherdauer der Server-Logs/)).not.toBeInTheDocument()
  })

  it('gives the legal notice the same header without a table of contents', async () => {
    renderAt('/legal-notice')
    expect(await screen.findByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('navigation', { name: 'Inhalt' })).not.toBeInTheDocument()
  })
})
