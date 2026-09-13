import { useMatchRoute } from '@tanstack/react-router'
import { LanguageMenu } from './language-menu.tsx'

/** Top bar with the language dropdown. The board has its own header with the dropdown built in. */
export function SiteHeader() {
  const matchRoute = useMatchRoute()
  if (matchRoute({ to: '/' })) return null
  return (
    <header className="mx-auto flex max-w-[96rem] justify-end px-4 pt-3 sm:px-6 print:hidden">
      <LanguageMenu />
    </header>
  )
}
