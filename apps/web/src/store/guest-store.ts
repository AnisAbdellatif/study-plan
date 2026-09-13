import { createGuestDocument, type ParseFailure, type Plan, parseGuestDocument } from '@study-plan/shared'
import { createContext, useContext, useSyncExternalStore } from 'react'

export const STORAGE_KEY = 'study-plan:guest'
/** Raw data that could not be read is copied here before anything can overwrite it. */
export const BACKUP_KEY = 'study-plan:guest:unreadable'
export const EXPORT_KEY = 'study-plan:guest:last-export'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Runs `write` later, e.g. when the browser is idle. Without one, every plan change is written immediately. */
export type PersistScheduler = (write: () => void) => void

export interface GuestState {
  plan: Plan | null
  /** Set when stored data could not be read. */
  loadError: ParseFailure | null
  /** Set when the last write to browser storage failed, e.g. storage is blocked or full. */
  saveFailed: boolean
  lastExportedAt: string | null
}

export interface GuestStore {
  getState(): GuestState
  subscribe(listener: () => void): () => void
  /** Applies a pure plan operation, stamps updatedAt and persists. No-op without a plan. */
  updatePlan(update: (plan: Plan) => Plan): void
  replacePlan(plan: Plan | null): void
  markExported(at: Date): void
  dismissLoadError(): void
  /** Re-reads storage, e.g. after another tab changed it. */
  reload(): void
  /** Writes a plan change that is still waiting for the scheduler, e.g. when the page is hidden or closed. */
  flush(): void
}

export function createGuestStore(
  storage: StorageLike | null,
  now: () => Date = () => new Date(),
  schedulePersist?: PersistScheduler,
): GuestStore {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  const write = (key: string, value: string | null): boolean => {
    if (!storage) return false
    try {
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  const load = (): GuestState => {
    const lastExportedAt = read(EXPORT_KEY)
    const raw = read(STORAGE_KEY)
    if (raw === null) return { plan: null, loadError: null, saveFailed: false, lastExportedAt }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = undefined
    }
    const result = parseGuestDocument(parsed)
    if (result.success)
      return { plan: result.document.plan, loadError: null, saveFailed: false, lastExportedAt }

    write(BACKUP_KEY, raw)
    return { plan: null, loadError: result, saveFailed: false, lastExportedAt }
  }

  const persist = (plan: Plan | null): boolean =>
    write(STORAGE_KEY, plan === null ? null : JSON.stringify(createGuestDocument(plan)))

  let state = load()
  const listeners = new Set<() => void>()
  const set = (next: GuestState) => {
    state = next
    for (const listener of listeners) listener()
  }

  // Serialising a plan with all module details is the expensive part of an edit. With a scheduler, quick edits
  // (a drag, typing a grade) are coalesced into one write of the latest plan.
  let pending: Plan | null = null
  let scheduled = false
  const flush = () => {
    scheduled = false
    const plan = pending
    pending = null
    if (!plan) return
    const saveFailed = !persist(plan)
    if (saveFailed !== state.saveFailed) set({ ...state, saveFailed })
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    updatePlan(update) {
      if (!state.plan) return
      const plan = { ...update(state.plan), updatedAt: now().toISOString() }
      if (!schedulePersist) {
        set({ ...state, plan, saveFailed: !persist(plan) })
        return
      }
      pending = plan
      set({ ...state, plan })
      if (!scheduled) {
        scheduled = true
        schedulePersist(flush)
      }
    },
    replacePlan(plan) {
      // Replacing is rare and must not be overtaken by an older pending write.
      pending = null
      const saved = persist(plan)
      set({ ...state, plan, loadError: null, saveFailed: plan !== null && !saved })
    },
    markExported(at) {
      const value = at.toISOString()
      write(EXPORT_KEY, value)
      set({ ...state, lastExportedAt: value })
    },
    dismissLoadError() {
      set({ ...state, loadError: null })
    },
    reload() {
      // Another tab wrote newer data; as before, the last write wins.
      pending = null
      set(load())
    },
    flush,
  }
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Writes when the browser is idle, at the latest after a second; main.tsx flushes when the page is hidden. */
const whenIdle: PersistScheduler = (write) => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(write, { timeout: 1000 })
  else window.setTimeout(write, 200)
}

export const guestStore = createGuestStore(browserStorage(), undefined, whenIdle)

export const GuestStoreContext = createContext<GuestStore>(guestStore)

export const useGuestStore = (): GuestStore => useContext(GuestStoreContext)

export function useGuestState(): GuestState {
  const store = useGuestStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
