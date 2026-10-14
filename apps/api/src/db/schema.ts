/**
 * Database schema. The first five tables are the ones Better Auth expects (field names must match its models);
 * `plan` holds each account's plans as validated guest documents.
 */
import type {
  CalendarChange,
  CalendarDisplay,
  CalendarEvent,
  CalendarFetchError,
  CalendarSelection,
  GuestDocument,
  Preset,
} from '@study-plan/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    /** Plans this account may keep. Null uses the global value, see src/plan-limits.ts. Set by admins only. */
    planLimit: integer('plan_limit'),
    /** Study assistant messages without the daily limit, see routes/chat.ts. Set by admins only. */
    unlimitedChat: boolean('unlimited_chat').notNull().default(false),
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

/** Settings admins change at runtime, one row per key. Missing rows mean the default from the code. */
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Study assistant messages per account per day (Berlin time), for the daily limit. No message content. */
export const chatUsage = pgTable(
  'chat_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
)

/**
 * Study assistant totals per day (Berlin time) and model for the admin dashboard. No account, question or answer
 * is stored with them. `cost` is in the provider's credits (USD for OpenRouter).
 */
export const chatModelUsage = pgTable(
  'chat_model_usage',
  {
    day: date('day', { mode: 'string' }).notNull(),
    model: text('model').notNull(),
    questions: integer('questions').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    calls: integer('calls').notNull().default(0),
    promptTokens: bigint('prompt_tokens', { mode: 'number' }).notNull().default(0),
    completionTokens: bigint('completion_tokens', { mode: 'number' }).notNull().default(0),
    cost: doublePrecision('cost').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.model] })],
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
    /** The owner chose to show results and grades through this link. Exam dates and the target grade never show. */
    includeGrades: boolean('include_grades').notNull().default(false),
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
 * A student's calendar settings, feeds and noticed changes, shared by all their Stud.IP links (calendar_source).
 * The row exists while the student has at least one link.
 */
export const calendar = pgTable('calendar', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** How dates look in every feed; what each link contributes is calendar_source.selection. */
  settings: jsonb('settings').$type<CalendarDisplay>().notNull(),
  /** The latest changes, newest first, for the calendar page. */
  changes: jsonb('changes').$type<CalendarChange[]>().notNull().default([]),
  ...timestamps(),
})

/**
 * A Stud.IP calendar link of a student, up to MAX_CALENDAR_SOURCES per account. The link is stored encrypted, see
 * calendar/secrets.ts; `events` keeps the last good copy, which the feeds serve while the upstream is unreachable.
 */
export const calendarSource = pgTable(
  'calendar_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => calendar.userId, { onDelete: 'cascade' }),
    /** The link, encrypted. Never sent back to the browser or logged. */
    encryptedUrl: text('encrypted_url').notNull(),
    host: text('host').notNull(),
    /** The student's name for the link, e.g. "Zweitfach". */
    label: text('label'),
    status: text('status', { enum: ['pending', 'ok', 'error'] })
      .notNull()
      .default('pending'),
    lastError: text('last_error').$type<CalendarFetchError>(),
    /** Failed fetches in a row; the sync waits longer between them. */
    failures: integer('failures').notNull().default(0),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    events: jsonb('events').$type<CalendarEvent[]>().notNull().default([]),
    /** The student's choices, short names and colours for this link's subjects. */
    selection: jsonb('selection').$type<CalendarSelection>().notNull(),
    ...timestamps(),
  },
  (table) => [
    index('calendar_source_user_id_idx').on(table.userId),
    index('calendar_source_last_fetched_at_idx').on(table.lastFetchedAt),
  ],
)

/** A subscribable selection of a student's subjects. Its URL is derived, see calendar/secrets.ts. */
export const calendarFeed = pgTable(
  'calendar_feed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => calendar.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The links (calendar_source ids) whose dates the feed shows; several mix them into one calendar. */
    sourceIds: jsonb('source_ids').$type<string[]>().notNull(),
    /** Null: every subject the student keeps. */
    subjects: jsonb('subjects').$type<string[] | null>(),
    /** Raised to make the current URL stop working. */
    tokenVersion: integer('token_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('calendar_feed_user_id_idx').on(table.userId)],
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
        'update_settings',
        'set_plan_limit',
        'update_chat_settings',
        'set_unlimited_chat',
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
