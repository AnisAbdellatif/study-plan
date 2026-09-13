import './i18n/index.ts'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme } from './lib/theme.ts'
import { createAppRouter } from './router.tsx'
import { guestStore, STORAGE_KEY } from './store/guest-store.ts'
import '@fontsource-variable/outfit'
import './styles.css'

applyTheme()

const router = createAppRouter()

// Keep tabs in sync: another tab may have edited or cleared the plan.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) guestStore.reload()
})

// Plan changes are written when the browser is idle; leaving or hiding the page writes the last one right away.
window.addEventListener('pagehide', () => guestStore.flush())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') guestStore.flush()
})

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
