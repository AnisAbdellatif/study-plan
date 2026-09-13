import { useMatchRoute } from '@tanstack/react-router'
import { AdminButton } from './admin-button.tsx'
import { LanguageMenu } from './language-menu.tsx'
import { ThemeToggle } from './theme-toggle.tsx'

/** Top bar with the language dropdown. The board has its own header with the dropdown built in. */
export function SiteHeader() {
  const matchRoute = useMatchRoute()
  if (matchRoute({ to: '/' })) return null
  return (
    <header className="mx-auto flex max-w-[96rem] justify-end gap-1 px-4 pt-3 sm:px-6 print:hidden">
      <AdminButton />
      <LanguageMenu />
      <ThemeToggle />
    </header>
  )
}
