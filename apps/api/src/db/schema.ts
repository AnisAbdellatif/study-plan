/**
 * Database schema. The first five tables are the ones Better Auth expects (field names must match its models);
 * `plan` holds each account's plans as validated guest documents.
 */
import type { GuestDocument, Preset } from '@study-plan/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /** UI language for e-mails, 'de' or 'en'. A Better Auth additional field, see auth.ts. */
    locale: text('locale').notNull().default('de'),
    /** Access level, see src/roles.ts. Never settable through the auth API. */
    role: text('role', { enum: ['user', 'admin', 'superadmin'] })
      .notNull()
      .default('user'),
    ...timestamps(),
  },
  // At most one superadmin, enforced by the database.
  (table) => [uniqueIndex('user_single_superadmin_idx').on(table.role).where(sql`role = 'superadmin'`)],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Salted scrypt hash, see src/password.ts. */
    password: text('password'),
    ...timestamps(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_issuer_account_id_idx').on(table.issuer, table.accountId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

/** Request counters per IP address and path for Better Auth's rate limiter. */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

export const plan = pgTable(
  'plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    document: jsonb('document').$type<GuestDocument>().notNull(),
    /** Incremented on every save; a PUT with an older revision is rejected as a conflict. */
    revision: integer('revision').notNull().default(1),
    ...timestamps(),
  },
  (table) => [index('plan_user_id_idx').on(table.userId)],
)

/** Unlisted share links. Only a SHA-256 hash of the token is stored; the owner sees the token once. */
export const planShare = pgTable(
  'plan_share',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('plan_share_plan_id_idx').on(table.planId)],
)

/** E-mail reminder settings. Reminders are opt-in: without a row they are off. */
export const notificationSetting = pgTable('notification_setting', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  examReminders: boolean('exam_reminders').notNull().default(false),
  ...timestamps(),
})

/** One row per reminder sent, so each deadline is mailed only once. Old rows are purged after the deadline. */
export const reminderDelivery = pgTable(
  'reminder_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    moduleCode: text('module_code').notNull(),
    kind: text('kind', { enum: ['withdrawal', 'exam'] }).notNull(),
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('reminder_delivery_event_idx').on(
      table.planId,
      table.moduleCode,
      table.kind,
      table.eventDate,
    ),
  ],
)

/**
 * Admin actions, for accountability. Targets are stored by account id only, so a deleted account leaves no
 * e-mail address behind. Entries are purged after a year.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminEmail: text('admin_email').notNull(),
    action: text('action', {
      enum: [
        'send_verification_email',
        'revoke_shares',
        'sign_out',
        'delete_user',
        'grant_admin',
        'revoke_admin',
        'create_admin',
        'send_test_email',
        'create_preset',
        'update_preset',
        'delete_preset',
      ],
    }).notNull(),
    targetUserId: text('target_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('admin_audit_log_created_at_idx').on(table.createdAt)],
)

/**
 * Programme presets managed by admins, which students pick on the start page. The columns duplicate the
 * document's names so the list and the uniqueness check need no JSON access. `document.id` is derived from the
 * row id, see routes/presets.ts.
 */
export const preset = pgTable(
  'preset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    universityName: text('university_name').notNull(),
    programmeName: text('programme_name').notNull(),
    degree: text('degree', { enum: ['bsc', 'msc'] }).notNull(),
    poVersion: text('po_version').notNull(),
    document: jsonb('document').$type<Preset>().notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('preset_programme_idx').on(
      table.universityName,
      table.programmeName,
      table.degree,
      table.poVersion,
    ),
  ],
)
