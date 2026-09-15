import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from '@tanstack/react-router'
import { AccountSyncProvider } from './components/account-sync.tsx'
import { AnnouncerProvider } from './components/announcer.tsx'
import { LocaleSync } from './components/locale-sync.tsx'
import { SiteFooter } from './components/site-footer.tsx'
import { SiteHeader } from './components/site-header.tsx'
import { validateAdminSearch } from './routes/admin-tabs.ts'
import { BoardPage } from './routes/board-page.tsx'
import { LandingPage } from './routes/landing-page.tsx'
import { validateStartSearch } from './routes/start-methods.ts'
import { StartPage } from './routes/start-page.tsx'

// The board and the start page are where almost every visit begins, so they ship in the main bundle. Every other
// page is loaded when it is first opened (or when a link to it is hovered).
const authPages = () => import('./routes/auth-pages.tsx')
const SignInPage = lazyRouteComponent(authPages, 'SignInPage')
const SignUpPage = lazyRouteComponent(authPages, 'SignUpPage')
const ForgotPasswordPage = lazyRouteComponent(authPages, 'ForgotPasswordPage')
const ResetPasswordPage = lazyRouteComponent(authPages, 'ResetPasswordPage')
const AccountPage = lazyRouteComponent(authPages, 'AccountPage')
const UnsubscribePage = lazyRouteComponent(authPages, 'UnsubscribePage')
const ImpressumPage = lazyRouteComponent(() => import('./legal/impressum-page.tsx'), 'ImpressumPage')
const DatenschutzPage = lazyRouteComponent(() => import('./legal/datenschutz-page.tsx'), 'DatenschutzPage')
const AdminPage = lazyRouteComponent(() => import('./routes/admin-page.tsx'), 'AdminPage')
const ContactPage = lazyRouteComponent(() => import('./routes/contact-page.tsx'), 'ContactPage')
const PrintPage = lazyRouteComponent(() => import('./routes/print-page.tsx'), 'PrintPage')
const SharedPlanPage = lazyRouteComponent(() => import('./routes/shared-plan-page.tsx'), 'SharedPlanPage')
const UpdateProgrammePage = lazyRouteComponent(
  () => import('./routes/update-programme-page.tsx'),
  'UpdateProgrammePage',
)

const rootRoute = createRootRoute({
  component: () => (
    <AnnouncerProvider>
      <AccountSyncProvider>
        {/* At least one screen tall, with the page growing, so the footer sits at the bottom of short pages. */}
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <div className="flex-1">
            <Outlet />
          </div>
          <SiteFooter />
        </div>
        <LocaleSync />
      </AccountSyncProvider>
    </AnnouncerProvider>
  ),
})

const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BoardPage })
const startRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/start',
  validateSearch: validateStartSearch,
  component: StartPage,
})
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/about', component: LandingPage })
const printRoute = createRoute({ getParentRoute: () => rootRoute, path: '/print', component: PrintPage })
const updateProgrammeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plan/update',
  component: UpdateProgrammePage,
})
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
const contactRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contact',
  component: ContactPage,
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

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  validateSearch: validateAdminSearch,
  component: AdminPage,
})

export const routeTree = rootRoute.addChildren([
  boardRoute,
  startRoute,
  updateProgrammeRoute,
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
  contactRoute,
  aboutRoute,
  printRoute,
])

type RouterOptions = Parameters<typeof createRouter<typeof routeTree>>[0]

export const createAppRouter = (history?: RouterOptions['history']) => createRouter({ routeTree, history })

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
