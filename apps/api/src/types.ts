export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface AppEnv {
  Variables: {
    user: SessionUser
  }
}
