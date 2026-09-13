import './i18n/index.ts'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createAppRouter } from './router.tsx'
import { guestStore, STORAGE_KEY } from './store/guest-store.ts'
import './styles.css'

const router = createAppRouter()

// Keep tabs in sync: another tab may have edited or cleared the plan.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) guestStore.reload()
})

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
