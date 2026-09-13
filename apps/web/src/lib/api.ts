import type {
  CustomPresetFailure,
  CustomPresetIssue,
  CustomPresetWarning,
  GuestDocument,
  Plan,
  Preset,
} from '@study-plan/shared'

export interface PlanSummary {
  id: string
  name: string
  revision: number
  updatedAt: string
}

export interface StoredPlan extends PlanSummary {
  document: GuestDocument
}

/** The account's plans and how many it may keep. */
export interface PlanOverview {
  plans: PlanSummary[]
  limit: number
}

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(`API request failed with ${status} (${code})`)
    this.status = status
    this.code = code
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
  })
}

/** A programme file the server rejected, with the same reason and issues the start page shows for files. */
export class InvalidPresetError extends ApiError {
  readonly reason: CustomPresetFailure['reason']
  readonly issues: CustomPresetIssue[]

  constructor(status: number, reason: CustomPresetFailure['reason'], issues: CustomPresetIssue[]) {
    super(status, 'invalid_preset')
    this.reason = reason
    this.issues = issues
  }
}

const REASONS = new Set<string>(['empty', 'no_json', 'invalid_json', 'invalid_preset'])

async function readError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null || !('error' in body) || typeof body.error !== 'string') {
    return new ApiError(response.status, 'unknown')
  }
  if (body.error === 'invalid_preset' && 'reason' in body && typeof body.reason === 'string') {
    const reason = REASONS.has(body.reason)
      ? (body.reason as CustomPresetFailure['reason'])
      : 'invalid_preset'
    const issues = 'issues' in body && Array.isArray(body.issues) ? (body.issues as CustomPresetIssue[]) : []
    return new InvalidPresetError(response.status, reason, issues)
  }
  return new ApiError(response.status, body.error)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  if (!response.ok) throw await readError(response)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export type SaveResult = { status: 'saved'; plan: PlanSummary } | { status: 'conflict'; current: StoredPlan }

export const planApi = {
  list: async (): Promise<PlanSummary[]> => (await request<PlanOverview>('/api/plans')).plans,
  overview: (): Promise<PlanOverview> => request<PlanOverview>('/api/plans'),
  remove: (id: string): Promise<void> =>
    request<void>(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  get: (id: string): Promise<StoredPlan> => request<StoredPlan>(`/api/plans/${encodeURIComponent(id)}`),
  create: (document: GuestDocument): Promise<PlanSummary> =>
    request<PlanSummary>('/api/plans', { method: 'POST', body: JSON.stringify({ document }) }),
  /** Saves only if the server still has `revision`; otherwise returns the newer version from the server. */
  async update(id: string, document: GuestDocument, revision: number): Promise<SaveResult> {
    const response = await send(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ document, revision }),
    })
    if (response.status === 409) {
      const body = (await response.json()) as { current: StoredPlan }
      return { status: 'conflict', current: body.current }
    }
    if (!response.ok) throw await readError(response)
    return { status: 'saved', plan: (await response.json()) as PlanSummary }
  },
}

export type PlanApi = typeof planApi

export interface ShareStatus {
  active: boolean
  createdAt: string | null
  /** Whether the active link also shows results and grades. */
  includeGrades: boolean
}

export interface CreatedShare {
  token: string
  url: string
  createdAt: string | null
  includeGrades: boolean
}

export interface SharedPlanResponse {
  name: string
  updatedAt: string
  sharedAt: string
  /** True when the owner shared results and grades too. Missing from older servers means no grades. */
  includeGrades?: boolean
  /** Structure, plus results when `includeGrades`; never exam dates or the target grade. Validate before use. */
  plan: Plan
}

export const shareApi = {
  status: (planId: string): Promise<ShareStatus> =>
    request<ShareStatus>(`/api/plans/${encodeURIComponent(planId)}/share`),
  create: (
    planId: string,
    options: { includeGrades: boolean } = { includeGrades: false },
  ): Promise<CreatedShare> =>
    request<CreatedShare>(`/api/plans/${encodeURIComponent(planId)}/share`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  revoke: (planId: string): Promise<void> =>
    request<void>(`/api/plans/${encodeURIComponent(planId)}/share`, { method: 'DELETE' }),
  get: (token: string): Promise<SharedPlanResponse> =>
    request<SharedPlanResponse>(`/api/share/${encodeURIComponent(token)}`),
}

export interface NotificationSettings {
  examReminders: boolean
}

export const notificationApi = {
  get: (): Promise<NotificationSettings> => request<NotificationSettings>('/api/account/notifications'),
  update: (settings: NotificationSettings): Promise<NotificationSettings> =>
    request<NotificationSettings>('/api/account/notifications', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  /** Uses the token from a reminder e-mail, no sign-in needed. */
  unsubscribe: (token: string): Promise<NotificationSettings> =>
    request<NotificationSettings>(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }),
}

export interface PresetSummary {
  /** Row id for URLs; the preset document's own id is "preset/<id>". */
  id: string
  universityName: string
  programmeName: string
  degree: 'bsc' | 'msc'
  poVersion: string
  updatedAt: string
}

const presetPath = (id: string) => `/api/presets/${encodeURIComponent(id)}`
const adminPresetPath = (id: string) => `/api/admin/presets/${encodeURIComponent(id)}`

/** Admin-managed presets. Public, no account needed. */
export const presetApi = {
  list: async (): Promise<PresetSummary[]> =>
    (await request<{ presets: PresetSummary[] }>('/api/presets')).presets,
  /** The full programme data. Validate before use. */
  get: async (id: string): Promise<Preset> => (await request<{ preset: Preset }>(presetPath(id))).preset,
}

export interface SavedPreset {
  preset: PresetSummary
  warnings: CustomPresetWarning[]
}

export interface AdminStats {
  users: { total: number; verified: number; newLast30Days: number; activeLast30Days: number }
  plans: {
    total: number
    byPreset: {
      presetId: string
      programmeName: string
      universityName: string
      poVersion: string
      plans: number
    }[]
  }
  shares: { active: number }
  reminders: { enabled: number; sentLast30Days: number }
}

/** `superadmin` is the one account created from the server environment; it also manages admins. */
export type UserRole = 'user' | 'admin' | 'superadmin'

export interface AdminUser {
  id: string
  email: string
  emailVerified: boolean
  role: UserRole
  createdAt: string
  lastActiveAt: string | null
  plans: number
  /** The account's own plan limit; null uses the global value. */
  planLimit: number | null
  activeShares: number
  reminders: boolean
}

export type AdminAction =
  | 'send_verification_email'
  | 'revoke_shares'
  | 'sign_out'
  | 'delete_user'
  | 'grant_admin'
  | 'revoke_admin'

export type PresetAction = 'create_preset' | 'update_preset' | 'delete_preset'

export interface AdminAuditEntry {
  id: string
  adminEmail: string
  action:
    | AdminAction
    | 'create_admin'
    | 'send_test_email'
    | PresetAction
    | 'update_settings'
    | 'set_plan_limit'
  targetUserId: string
  createdAt: string
}

export interface MailDelivery {
  at: string
  error?: string
}

export interface MailStatus {
  transport: 'smtp' | 'console' | 'memory'
  from: string
  server: { host: string; port: number; secure: boolean; username: string | null } | null
  lastSuccess: MailDelivery | null
  lastFailure: MailDelivery | null
}

export type MailCheck = { ok: true; durationMs: number } | { ok: false; error: string }
export type TestMailResult = { ok: true; to: string } | { ok: false; error: string }

export interface AdminSettings {
  /** Plans each account may keep unless it has its own limit. */
  maxPlansPerUser: number
}

/** Bounds the API accepts for plan limits, see apps/api/src/plan-limits.ts. */
export const PLAN_LIMIT_MIN = 1
export const PLAN_LIMIT_MAX = 50

export interface NewAdmin {
  email: string
  name?: string
  password: string
}

const adminUser = (id: string) => `/api/admin/users/${encodeURIComponent(id)}`

/** Operator tools. Every call answers 404 for accounts without admin access. */
export const adminApi = {
  me: (): Promise<{ email: string; role: Exclude<UserRole, 'user'> }> => request('/api/admin/me'),
  stats: (): Promise<AdminStats> => request<AdminStats>('/api/admin/stats'),
  mailStatus: (): Promise<MailStatus> => request<MailStatus>('/api/admin/mail'),
  verifyMail: (): Promise<MailCheck> => request<MailCheck>('/api/admin/mail/verify', { method: 'POST' }),
  sendTestMail: (): Promise<TestMailResult> =>
    request<TestMailResult>('/api/admin/mail/test', { method: 'POST' }),
  users: async (query: string, { adminsOnly = false } = {}): Promise<AdminUser[]> =>
    (
      await request<{ users: AdminUser[] }>(
        `/api/admin/users?q=${encodeURIComponent(query)}${adminsOnly ? '&role=admin' : ''}`,
      )
    ).users,
  /** Superadmin only. */
  setRole: (id: string, role: 'admin' | 'user'): Promise<{ role: UserRole }> =>
    request<{ role: UserRole }>(`${adminUser(id)}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  /** Superadmin only. */
  createAdmin: (admin: NewAdmin): Promise<{ id: string }> =>
    request<{ id: string }>('/api/admin/admins', { method: 'POST', body: JSON.stringify(admin) }),
  settings: (): Promise<AdminSettings> => request<AdminSettings>('/api/admin/settings'),
  updateSettings: (settings: AdminSettings): Promise<AdminSettings> =>
    request<AdminSettings>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  /** Null returns the account to the global limit. */
  setPlanLimit: (id: string, planLimit: number | null): Promise<{ planLimit: number | null }> =>
    request<{ planLimit: number | null }>(`${adminUser(id)}/plan-limit`, {
      method: 'PUT',
      body: JSON.stringify({ planLimit }),
    }),
  audit: async (): Promise<AdminAuditEntry[]> =>
    (await request<{ entries: AdminAuditEntry[] }>('/api/admin/audit')).entries,
  sendVerificationEmail: (id: string): Promise<void> =>
    request<void>(`${adminUser(id)}/verification-email`, { method: 'POST' }),
  revokeShares: (id: string): Promise<{ revoked: number }> =>
    request<{ revoked: number }>(`${adminUser(id)}/revoke-shares`, { method: 'POST' }),
  signOut: (id: string): Promise<{ sessions: number }> =>
    request<{ sessions: number }>(`${adminUser(id)}/sign-out`, { method: 'POST' }),
  deleteUser: (id: string): Promise<void> => request<void>(adminUser(id), { method: 'DELETE' }),
  /**
   * `file` is the programme file's text, sent as is. Rejected files throw an InvalidPresetError; an existing
   * university, programme, degree and PO version throws an ApiError with code `preset_exists`.
   */
  createPreset: (file: string): Promise<SavedPreset> =>
    request<SavedPreset>('/api/admin/presets', { method: 'POST', body: file }),
  /** Replaces the data and keeps the id. */
  replacePreset: (id: string, file: string): Promise<SavedPreset> =>
    request<SavedPreset>(adminPresetPath(id), { method: 'PUT', body: file }),
  deletePreset: (id: string): Promise<void> => request<void>(adminPresetPath(id), { method: 'DELETE' }),
}
