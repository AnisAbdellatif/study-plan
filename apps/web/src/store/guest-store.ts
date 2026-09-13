import { createGuestDocument, type ParseFailure, type Plan, parseGuestDocument } from '@study-plan/shared'
import { createContext, useContext, useSyncExternalStore } from 'react'

export const STORAGE_KEY = 'study-plan:guest'
/** Raw data that could not be read is copied here before anything can overwrite it. */
export const BACKUP_KEY = 'study-plan:guest:unreadable'
export const EXPORT_KEY = 'study-plan:guest:last-export'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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
}

export function createGuestStore(
  storage: StorageLike | null,
  now: () => Date = () => new Date(),
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
      set({ ...state, plan, saveFailed: !persist(plan) })
    },
    replacePlan(plan) {
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
      set(load())
    },
  }
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const guestStore = createGuestStore(browserStorage())

export const GuestStoreContext = createContext<GuestStore>(guestStore)

export const useGuestStore = (): GuestStore => useContext(GuestStoreContext)

export function useGuestState(): GuestState {
  const store = useGuestStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
