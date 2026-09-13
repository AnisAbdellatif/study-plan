import { Link } from '@tanstack/react-router'

export function SiteFooter() {
  return (
    <footer className="mx-auto flex print:hidden max-w-[96rem] flex-wrap gap-x-4 gap-y-1 px-4 pt-2 pb-8 text-xs text-zinc-600 sm:px-6 dark:text-zinc-400">
      <Link to="/impressum" className="underline-offset-4 hover:underline">
        Impressum
      </Link>
      <Link to="/datenschutz" className="underline-offset-4 hover:underline">
        Datenschutz
      </Link>
    </footer>
  )
}
