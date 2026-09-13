import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AnnouncerProvider } from './components/announcer.tsx'
import { BoardPage } from './routes/board-page.tsx'
import { StartPage } from './routes/start-page.tsx'

const rootRoute = createRootRoute({
  component: () => (
    <AnnouncerProvider>
      <Outlet />
    </AnnouncerProvider>
  ),
})

const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BoardPage })
const startRoute = createRoute({ getParentRoute: () => rootRoute, path: '/start', component: StartPage })

export const routeTree = rootRoute.addChildren([boardRoute, startRoute])

type RouterOptions = Parameters<typeof createRouter<typeof routeTree>>[0]

export const createAppRouter = (history?: RouterOptions['history']) => createRouter({ routeTree, history })

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
