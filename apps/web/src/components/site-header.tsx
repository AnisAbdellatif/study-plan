import { useMatchRoute } from '@tanstack/react-router'
import { AccountButton } from './account-button.tsx'
import { AdminButton } from './admin-button.tsx'
import { LanguageMenu } from './language-menu.tsx'
import { ThemeToggle } from './theme-toggle.tsx'

/** Top bar with the language dropdown and the account menu. The board has its own header with both built in. */
export function SiteHeader() {
  const matchRoute = useMatchRoute()
  if (matchRoute({ to: '/' })) return null
  return (
    <header className="mx-auto flex max-w-[240rem] items-center justify-end gap-1 px-4 pt-3 sm:px-6 print:hidden">
      <AdminButton />
      <LanguageMenu />
      <ThemeToggle />
      <AccountButton />
    </header>
  )
}
