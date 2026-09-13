import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setTheme, useTheme } from '../lib/theme.ts'
import { Button } from './ui/button.tsx'

/** Switches between light and dark. Until the first click the system setting decides. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const theme = useTheme()
  const label = t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </Button>
  )
}
