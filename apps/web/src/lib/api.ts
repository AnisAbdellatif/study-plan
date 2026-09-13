import type { GuestDocument, Plan } from '@study-plan/shared'

export interface PlanSummary {
  id: string
  name: string
  revision: number
  updatedAt: string
}

export interface StoredPlan extends PlanSummary {
  document: GuestDocument
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

async function readError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  const code =
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'unknown'
  return new ApiError(response.status, code)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  if (!response.ok) throw await readError(response)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export type SaveResult = { status: 'saved'; plan: PlanSummary } | { status: 'conflict'; current: StoredPlan }

export const planApi = {
  list: async (): Promise<PlanSummary[]> => (await request<{ plans: PlanSummary[] }>('/api/plans')).plans,
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
}

export interface CreatedShare {
  token: string
  url: string
  createdAt: string | null
}

export interface SharedPlanResponse {
  name: string
  updatedAt: string
  sharedAt: string
  /** Structure only: no results, exam dates or target grade. Validate before use. */
  plan: Plan
}

export const shareApi = {
  status: (planId: string): Promise<ShareStatus> =>
    request<ShareStatus>(`/api/plans/${encodeURIComponent(planId)}/share`),
  create: (planId: string): Promise<CreatedShare> =>
    request<CreatedShare>(`/api/plans/${encodeURIComponent(planId)}/share`, { method: 'POST' }),
  revoke: (planId: string): Promise<void> =>
    request<void>(`/api/plans/${encodeURIComponent(planId)}/share`, { method: 'DELETE' }),
  get: (token: string): Promise<SharedPlanResponse> =>
    request<SharedPlanResponse>(`/api/share/${encodeURIComponent(token)}`),
}
