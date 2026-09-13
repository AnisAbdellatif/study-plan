import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

/** Also read by public/theme.js, which applies the theme before the app loads. */
export const THEME_STORAGE_KEY = 'study-plan:theme'

const listeners = new Set<() => void>()

const systemQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

function savedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** The explicit choice, otherwise the system setting. */
export const currentTheme = (): Theme => savedTheme() ?? (systemQuery()?.matches ? 'dark' : 'light')

export function applyTheme(theme: Theme = currentTheme()): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
  applyTheme(theme)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const query = systemQuery()
  // The system setting only matters while there is no explicit choice.
  const onSystemChange = () => {
    if (savedTheme()) return
    applyTheme()
    listener()
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    applyTheme()
    listener()
  }
  query?.addEventListener('change', onSystemChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    query?.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}

export const useTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme, () => 'light')
