import { createPlanFromPreset, moveModule } from '@study-plan/shared'
import { describe, expect, it } from 'vitest'
import { examplePreset as preset } from '../test/fixtures.ts'
import { BACKUP_KEY, createGuestStore, EXPORT_KEY, STORAGE_KEY, type StorageLike } from './guest-store.ts'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
  return { storage, data }
}

const plan = createPlanFromPreset(preset, {
  id: 'plan-1',
  startTerm: { season: 'winter', year: 2026 },
  now: new Date('2026-09-13T10:00:00Z'),
})

describe('guest store', () => {
  it('starts empty', () => {
    const store = createGuestStore(memoryStorage().storage)
    expect(store.getState()).toEqual({ plan: null, loadError: null, saveFailed: false, lastExportedAt: null })
  })

  it('persists a plan and loads it in a new store', () => {
    const { storage } = memoryStorage()
    createGuestStore(storage).replacePlan(plan)
    expect(createGuestStore(storage).getState().plan).toEqual(plan)
  })

  it('stamps updatedAt on updates and notifies subscribers', () => {
    const { storage } = memoryStorage()
    const store = createGuestStore(storage, () => new Date('2026-10-01T08:00:00Z'))
    store.replacePlan(plan)
    let notified = 0
    store.subscribe(() => notified++)
    store.updatePlan((p) => moveModule(p, 'INF-101', 's2'))
    expect(notified).toBe(1)
    expect(store.getState().plan?.updatedAt).toBe('2026-10-01T08:00:00.000Z')
    expect(createGuestStore(storage).getState().plan?.semesters[1]?.moduleCodes[2]).toBe('INF-101')
  })

  it('keeps unreadable data in a backup key and reports why', () => {
    const { storage, data } = memoryStorage({ [STORAGE_KEY]: '{not json' })
    const store = createGuestStore(storage)
    expect(store.getState().plan).toBeNull()
    expect(store.getState().loadError?.reason).toBe('not_a_plan')
    expect(data.get(BACKUP_KEY)).toBe('{not json')
  })

  it('keeps working in memory when storage writes fail', () => {
    const { storage } = memoryStorage()
    const store = createGuestStore({
      ...storage,
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      },
    })
    store.replacePlan(plan)
    expect(store.getState().plan).toEqual(plan)
    expect(store.getState().saveFailed).toBe(true)
  })

  it('works without any storage', () => {
    const store = createGuestStore(null)
    store.replacePlan(plan)
    expect(store.getState()).toMatchObject({ plan, saveFailed: true })
  })

  it('remembers the last export', () => {
    const { storage, data } = memoryStorage()
    createGuestStore(storage).markExported(new Date('2026-09-20T12:00:00Z'))
    expect(data.get(EXPORT_KEY)).toBe('2026-09-20T12:00:00.000Z')
    expect(createGuestStore(storage).getState().lastExportedAt).toBe('2026-09-20T12:00:00.000Z')
  })
})
