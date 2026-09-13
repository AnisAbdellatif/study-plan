export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface AppEnv {
  Variables: {
    user: SessionUser
    /** Set by requireAdmin for /api/admin routes. */
    adminRole: 'admin' | 'superadmin'
  }
}
