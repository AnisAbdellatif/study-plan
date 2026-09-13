import { createGuestDocument, type Plan } from '@study-plan/shared'
import type { GuestStore, StorageLike } from '../store/guest-store.ts'
import { ApiError, type PlanApi, type StoredPlan } from './api.ts'

/** Which account plan the plan in this browser belongs to. */
export const LINK_KEY = 'study-plan:account-link'

export interface AccountLink {
  userId: string
  planId: string
  /** Server revision the browser last saw. */
  revision: number
  /** The plan's updatedAt at the last successful sync. A different value means unsaved local changes. */
  syncedUpdatedAt: string
}

export type SyncState =
  | { kind: 'signed_out' }
  | { kind: 'loading' }
  /**
   * Signed in, but the browser plan is not in the account (yet). It can be uploaded, unless the account already
   * holds as many plans as it may (`limitReached`).
   */
  | { kind: 'no_account_plan'; limitReached?: boolean }
  /** Signed in, and both the account and this browser have a plan that were never linked. */
  | { kind: 'choose'; remote: StoredPlan }
  | { kind: 'saving' }
  | { kind: 'synced'; savedAt: string; notice?: 'remote_newer' }
  /** Saving or loading failed, e.g. offline. The next change or retry() tries again. */
  | { kind: 'error' }

export interface PlanSyncOptions {
  store: GuestStore
  api: Pick<PlanApi, 'list' | 'get' | 'create' | 'update'>
  storage: StorageLike | null
  /** Pause after the last edit before saving. */
  debounceMs: number
}

function isLink(value: unknown): value is AccountLink {
  if (typeof value !== 'object' || value === null) return false
  const link = value as Record<string, unknown>
  return (
    typeof link.userId === 'string' &&
    typeof link.planId === 'string' &&
    typeof link.revision === 'number' &&
    typeof link.syncedUpdatedAt === 'string'
  )
}

/**
 * Keeps the browser plan and the account plan in step. The browser store stays the source the UI reads;
 * this class mirrors it to the server. When another device saved in between, the server version wins
 * and the student is told, because silently overwriting another device's edits would lose data.
 */
export class PlanSync {
  readonly #options: PlanSyncOptions
  #state: SyncState = { kind: 'signed_out' }
  readonly #listeners = new Set<() => void>()
  #userId: string | null = null
  #unsubscribe: (() => void) | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  #pushing: Promise<void> | null = null
  #pushAgain = false
  /** Set by startNewPlan: the next plan that appears in the browser is uploaded as a new account plan. */
  #uploadNext = false

  constructor(options: PlanSyncOptions) {
    this.#options = options
  }

  getState = (): SyncState => this.#state

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Starts syncing for a signed-in user. Safe to call repeatedly with the same user. */
  async start(userId: string): Promise<void> {
    if (this.#userId === userId) return
    this.#detach()
    this.#userId = userId
    this.#unsubscribe = this.#options.store.subscribe(() => this.#onStoreChange())
    this.#set({ kind: 'loading' })

    try {
      const summaries = await this.#options.api.list()
      if (this.#userId !== userId) return

      let link = this.#readLink()
      if (link && link.userId !== userId) {
        this.#writeLink(null)
        link = null
      }
      const local = this.#options.store.getState().plan
      const linked = link ? summaries.find((summary) => summary.id === link.planId) : undefined

      if (link && linked) {
        if (local && local.updatedAt !== link.syncedUpdatedAt) {
          await this.#push()
        } else if (!local || linked.revision !== link.revision) {
          await this.#loadRemote(linked.id, userId)
        } else {
          this.#set({ kind: 'synced', savedAt: linked.updatedAt })
        }
        return
      }
      if (link) this.#writeLink(null)

      const latest = summaries[0]
      if (!latest) {
        this.#set({ kind: 'no_account_plan' })
      } else if (!local) {
        await this.#loadRemote(latest.id, userId)
      } else {
        const remote = await this.#options.api.get(latest.id)
        if (this.#userId === userId) this.#set({ kind: 'choose', remote })
      }
    } catch {
      if (this.#userId === userId) this.#set({ kind: 'error' })
    }
  }

  /** Stops syncing, e.g. after signing out. The plan stays in this browser, unlinked from the account. */
  stop(): void {
    this.#uploadNext = false
    this.#detach()
    this.#writeLink(null)
    this.#set({ kind: 'signed_out' })
  }

  /** Saves the browser plan as the account's plan. */
  async uploadLocal(): Promise<void> {
    const userId = this.#userId
    const plan = this.#options.store.getState().plan
    if (!userId || !plan) return
    this.#set({ kind: 'saving' })
    try {
      const created = await this.#options.api.create(createGuestDocument(plan))
      if (this.#userId !== userId) return
      this.#writeLink({
        userId,
        planId: created.id,
        revision: created.revision,
        syncedUpdatedAt: plan.updatedAt,
      })
      this.#set({ kind: 'synced', savedAt: created.updatedAt })
    } catch (error) {
      if (this.#userId !== userId) return
      if (error instanceof ApiError && error.code === 'too_many_plans') {
        this.#set({ kind: 'no_account_plan', limitReached: true })
      } else {
        this.#set({ kind: 'error' })
      }
    }
  }

  /** Saves pending edits of the open plan, then opens another plan of the account in this browser. */
  async switchTo(planId: string): Promise<void> {
    const userId = this.#userId
    if (!userId) return
    await this.#flush()
    if (this.#userId !== userId) return
    this.#set({ kind: 'loading' })
    try {
      await this.#loadRemote(planId, userId)
    } catch {
      if (this.#userId === userId) this.#set({ kind: 'error' })
    }
  }

  /**
   * Saves pending edits of the open plan and detaches it from this browser. The next plan created here is saved
   * as a new account plan; the previous one stays in the account.
   */
  async startNewPlan(): Promise<void> {
    if (!this.#userId) return
    await this.#flush()
    this.#writeLink(null)
    this.#uploadNext = true
    this.#set({ kind: 'no_account_plan' })
  }

  /** Resolves `choose` by replacing the browser plan with the account plan. */
  loadAccountPlan(): void {
    if (this.#state.kind === 'choose' && this.#userId) this.#applyRemote(this.#state.remote, this.#userId)
  }

  /** Resolves `choose` by overwriting the account plan with the browser plan. */
  async keepBrowserPlan(): Promise<void> {
    if (this.#state.kind !== 'choose' || !this.#userId) return
    const { remote } = this.#state
    // An empty syncedUpdatedAt marks the browser plan as unsaved, so the push below uploads it.
    this.#writeLink({
      userId: this.#userId,
      planId: remote.id,
      revision: remote.revision,
      syncedUpdatedAt: '',
    })
    await this.#push()
  }

  /** The account plan this browser plan is saved to, or null when signed out or not saved yet. */
  linkedPlanId(): string | null {
    const link = this.#readLink()
    return this.#userId !== null && link?.userId === this.#userId ? link.planId : null
  }

  retry(): Promise<void> {
    return this.#push()
  }

  #set(state: SyncState): void {
    this.#state = state
    for (const listener of this.#listeners) listener()
  }

  #detach(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    this.#userId = null
  }

  #readLink(): AccountLink | null {
    try {
      const raw = this.#options.storage?.getItem(LINK_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return isLink(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  #writeLink(link: AccountLink | null): void {
    try {
      if (link) this.#options.storage?.setItem(LINK_KEY, JSON.stringify(link))
      else this.#options.storage?.removeItem(LINK_KEY)
    } catch {
      // Without storage the link lives only as long as this page; syncing still works until reload.
    }
  }

  async #loadRemote(id: string, userId: string): Promise<void> {
    const remote = await this.#options.api.get(id)
    if (this.#userId === userId) this.#applyRemote(remote, userId)
  }

  #applyRemote(remote: StoredPlan, userId: string, notice?: 'remote_newer'): void {
    // Write the link first, so the store change below is recognised as already synced and not pushed back.
    this.#writeLink({
      userId,
      planId: remote.id,
      revision: remote.revision,
      syncedUpdatedAt: remote.document.plan.updatedAt,
    })
    this.#options.store.replacePlan(remote.document.plan)
    this.#set(
      notice
        ? { kind: 'synced', savedAt: remote.updatedAt, notice }
        : { kind: 'synced', savedAt: remote.updatedAt },
    )
  }

  #hasUnsavedChanges(plan: Plan | null, link: AccountLink | null): boolean {
    return plan !== null && link !== null && plan.updatedAt !== link.syncedUpdatedAt
  }

  /** Pushes unsaved edits now instead of after the debounce, and waits for a push already running. */
  async #flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    if (this.#hasUnsavedChanges(this.#options.store.getState().plan, this.#readLink())) await this.#push()
    else if (this.#pushing) await this.#pushing
  }

  #onStoreChange(): void {
    if (!this.#userId || this.#state.kind === 'choose' || this.#state.kind === 'loading') return
    if (this.#uploadNext && !this.#readLink() && this.#options.store.getState().plan) {
      this.#uploadNext = false
      void this.uploadLocal()
      return
    }
    if (!this.#hasUnsavedChanges(this.#options.store.getState().plan, this.#readLink())) return
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.#push()
    }, this.#options.debounceMs)
  }

  #push(): Promise<void> {
    if (this.#pushing) {
      this.#pushAgain = true
      return this.#pushing
    }
    this.#pushing = this.#runPushes().finally(() => {
      this.#pushing = null
    })
    return this.#pushing
  }

  async #runPushes(): Promise<void> {
    do {
      this.#pushAgain = false
      const userId = this.#userId
      const link = this.#readLink()
      const plan = this.#options.store.getState().plan
      if (!userId || !link || !plan || !this.#hasUnsavedChanges(plan, link)) return

      this.#set({ kind: 'saving' })
      try {
        const result = await this.#options.api.update(link.planId, createGuestDocument(plan), link.revision)
        if (this.#userId !== userId) return
        if (result.status === 'conflict') {
          this.#applyRemote(result.current, userId, 'remote_newer')
          return
        }
        this.#writeLink({ ...link, revision: result.plan.revision, syncedUpdatedAt: plan.updatedAt })
        this.#set({ kind: 'synced', savedAt: result.plan.updatedAt })
      } catch {
        if (this.#userId === userId) this.#set({ kind: 'error' })
        return
      }
    } while (this.#pushAgain)
  }
}
