/**
 * Access levels. `user` is every student. `admin` opens the admin dashboard and manages student accounts.
 * `superadmin` is exactly one account, created from the environment on first start: it also manages admins,
 * and nobody can delete it, demote it or act on it through the dashboard.
 */
import { and, eq, ne } from 'drizzle-orm'
import type { Auth } from './auth.ts'
import type { Database } from './db/connection.ts'
import { user } from './db/schema.ts'

export type Role = (typeof user.role.enumValues)[number]
export type AdminRole = Exclude<Role, 'user'>

export const isAdminRole = (role: string | undefined): role is AdminRole =>
  role === 'admin' || role === 'superadmin'

/** Better Auth's issuer for e-mail and password accounts, `createLocalAccountIssuer('credential')`. */
export const CREDENTIAL_ISSUER = 'local:credential'

export interface PasswordAccountInput {
  email: string
  name: string
  password: string
  role: Role
}

/**
 * Creates a verified account that signs in with e-mail and password: the same user and account rows Better Auth
 * writes at sign-up, without sending a verification e-mail. Returns the new account id.
 */
export async function createPasswordAccount(db: Database, auth: Auth, input: PasswordAccountInput) {
  const context = await auth.$context
  const created = await context.internalAdapter.createUser(
    { email: input.email.toLowerCase(), name: input.name, emailVerified: true },
    { method: 'admin' },
  )
  try {
    await context.internalAdapter.linkAccount({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      issuer: CREDENTIAL_ISSUER,
      password: await context.password.hash(input.password),
    })
    await db.update(user).set({ role: input.role }).where(eq(user.id, created.id))
  } catch (error) {
    await db.delete(user).where(eq(user.id, created.id))
    throw error
  }
  return created.id
}

/**
 * The superadmin never needs e-mail verification. Marks it verified when the flag was lost, e.g. through a
 * database edit or a promotion. Pass an address to limit this to that account (sign-in); returns whether a row
 * changed.
 */
export async function verifySuperadminEmail(db: Database, email?: string): Promise<boolean> {
  const changed = await db
    .update(user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(
      and(
        eq(user.role, 'superadmin'),
        eq(user.emailVerified, false),
        email === undefined ? undefined : eq(user.email, email.trim().toLowerCase()),
      ),
    )
    .returning({ id: user.id })
  return changed.length > 0
}

export type SuperadminOutcome = 'created' | 'promoted' | 'exists'

/**
 * Makes sure the superadmin exists. Runs on every start but only acts once: when a superadmin already exists it
 * is left alone, so a changed password or e-mail address survives restarts. When an account with the configured
 * address exists but is not the superadmin yet, it is promoted and keeps its password.
 */
export async function ensureSuperadmin(
  db: Database,
  auth: Auth,
  seed: { email: string; password: string; name: string },
): Promise<SuperadminOutcome> {
  const email = seed.email.toLowerCase()
  const [existing] = await db.select({ email: user.email }).from(user).where(eq(user.role, 'superadmin'))
  if (existing) {
    if (existing.email !== email) {
      console.warn(
        `[api] the superadmin is ${existing.email}; SUPERADMIN_EMAIL (${email}) is only used for the first start`,
      )
    }
    await verifySuperadminEmail(db)
    return 'exists'
  }

  const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
  if (account) {
    await db
      .update(user)
      .set({ role: 'superadmin', emailVerified: true, updatedAt: new Date() })
      .where(and(eq(user.id, account.id), ne(user.role, 'superadmin')))
    return 'promoted'
  }

  await createPasswordAccount(db, auth, {
    email,
    name: seed.name,
    password: seed.password,
    role: 'superadmin',
  })
  return 'created'
}
