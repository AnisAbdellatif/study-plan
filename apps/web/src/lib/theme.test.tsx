import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { currentTheme, THEME_STORAGE_KEY } from './theme.ts'

function renderStart() {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/start'] }))
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
  vi.unstubAllGlobals()
})

describe('theme toggle', () => {
  it('switches between light and dark next to the language dropdown and remembers the choice', async () => {
    const user = renderStart()
    const toDark = await screen.findByRole('button', { name: 'Zu dunklem Design wechseln' })
    expect(document.documentElement).not.toHaveClass('dark')

    await user.click(toDark)
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Zu hellem Design wechseln' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('is labelled in English', async () => {
    await i18n.changeLanguage('en')
    renderStart()
    expect(await screen.findByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('follows the system setting until the student chooses', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(currentTheme()).toBe('dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(currentTheme()).toBe('light')
  })
})
