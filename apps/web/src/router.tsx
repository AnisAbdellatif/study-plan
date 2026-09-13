import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AccountSyncProvider } from './components/account-sync.tsx'
import { AnnouncerProvider } from './components/announcer.tsx'
import { SiteFooter } from './components/site-footer.tsx'
import { DatenschutzPage } from './legal/datenschutz-page.tsx'
import { ImpressumPage } from './legal/impressum-page.tsx'
import { AdminPage } from './routes/admin-page.tsx'
import {
  AccountPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
  UnsubscribePage,
} from './routes/auth-pages.tsx'
import { BoardPage } from './routes/board-page.tsx'
import { SharedPlanPage } from './routes/shared-plan-page.tsx'
import { StartPage } from './routes/start-page.tsx'

const rootRoute = createRootRoute({
  component: () => (
    <AnnouncerProvider>
      <AccountSyncProvider>
        <Outlet />
        <SiteFooter />
      </AccountSyncProvider>
    </AnnouncerProvider>
  ),
})

const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BoardPage })
const startRoute = createRoute({ getParentRoute: () => rootRoute, path: '/start', component: StartPage })
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: SignInPage })
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  component: SignUpPage,
})
const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
})
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
})
const impressumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/legal-notice',
  component: ImpressumPage,
})
const datenschutzRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: DatenschutzPage,
})
const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/$token',
  component: SharedPlanPage,
})

const unsubscribeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/unsubscribe',
  component: UnsubscribePage,
})

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminPage })

export const routeTree = rootRoute.addChildren([
  boardRoute,
  startRoute,
  signInRoute,
  signUpRoute,
  forgotRoute,
  resetRoute,
  accountRoute,
  impressumRoute,
  datenschutzRoute,
  sharedRoute,
  unsubscribeRoute,
  adminRoute,
])

type RouterOptions = Parameters<typeof createRouter<typeof routeTree>>[0]

export const createAppRouter = (history?: RouterOptions['history']) => createRouter({ routeTree, history })

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
