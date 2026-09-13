import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AccountSyncProvider } from './components/account-sync.tsx'
import { AnnouncerProvider } from './components/announcer.tsx'
import { SiteFooter } from './components/site-footer.tsx'
import { DatenschutzPage } from './legal/datenschutz-page.tsx'
import { ImpressumPage } from './legal/impressum-page.tsx'
import {
  AccountPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
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
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/anmelden', component: SignInPage })
const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/registrieren',
  component: SignUpPage,
})
const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/passwort-vergessen',
  component: ForgotPasswordPage,
})
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/passwort-neu',
  component: ResetPasswordPage,
})
const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: '/konto', component: AccountPage })
const impressumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/impressum',
  component: ImpressumPage,
})
const datenschutzRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/datenschutz',
  component: DatenschutzPage,
})
const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/geteilt/$token',
  component: SharedPlanPage,
})

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
])

type RouterOptions = Parameters<typeof createRouter<typeof routeTree>>[0]

export const createAppRouter = (history?: RouterOptions['history']) => createRouter({ routeTree, history })

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
