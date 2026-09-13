import { createPlanFromPreset, type Plan } from '@study-plan/shared'
import { describe, expect, it } from 'vitest'
import { examplePreset } from '../test/fixtures.ts'
import { createGuestStore, STORAGE_KEY, type StorageLike } from './guest-store.ts'

function memoryStorage(initial?: Plan) {
  const data = new Map<string, string>()
  let writes = 0
  let failing = false
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failing) throw new Error('quota')
      writes += 1
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
  const result = {
    storage,
    data,
    get writes() {
      return writes
    },
    fail() {
      failing = true
    },
  }
  if (initial) {
    createGuestStore(storage).replacePlan(initial)
    writes = 0
  }
  return result
}

const plan = () =>
  createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const storedName = (data: Map<string, string>) =>
  (JSON.parse(data.get(STORAGE_KEY) ?? '{}') as { plan?: Plan }).plan?.name

describe('guest store with a persist scheduler', () => {
  it('updates the state at once and coalesces storage writes into one', () => {
    const memory = memoryStorage(plan())
    const queued: Array<() => void> = []
    const store = createGuestStore(memory.storage, undefined, (write) => queued.push(write))

    store.updatePlan((current) => ({ ...current, name: 'Eins' }))
    store.updatePlan((current) => ({ ...current, name: 'Zwei' }))
    store.updatePlan((current) => ({ ...current, name: 'Drei' }))

    expect(store.getState().plan?.name).toBe('Drei')
    expect(memory.writes).toBe(0)
    expect(queued).toHaveLength(1)

    queued[0]?.()
    expect(memory.writes).toBe(1)
    expect(storedName(memory.data)).toBe('Drei')
  })

  it('writes a pending change on flush, e.g. when the page is hidden', () => {
    const memory = memoryStorage(plan())
    const store = createGuestStore(memory.storage, undefined, () => {})
    store.updatePlan((current) => ({ ...current, name: 'Vor dem Schließen' }))
    store.flush()
    expect(storedName(memory.data)).toBe('Vor dem Schließen')
    store.flush()
    expect(memory.writes).toBe(1)
  })

  it('drops a pending write when the plan is replaced or reloaded from another tab', () => {
    const memory = memoryStorage(plan())
    const queued: Array<() => void> = []
    const store = createGuestStore(memory.storage, undefined, (write) => queued.push(write))
    store.updatePlan((current) => ({ ...current, name: 'Veraltet' }))
    store.replacePlan({ ...plan(), name: 'Ersetzt' })
    queued[0]?.()
    expect(storedName(memory.data)).toBe('Ersetzt')

    store.updatePlan((current) => ({ ...current, name: 'Auch veraltet' }))
    memory.data.set(STORAGE_KEY, JSON.stringify({ ...JSON.parse(memory.data.get(STORAGE_KEY) ?? '{}') }))
    store.reload()
    queued[1]?.()
    expect(storedName(memory.data)).toBe('Ersetzt')
    expect(store.getState().plan?.name).toBe('Ersetzt')
  })

  it('reports a failed deferred write', () => {
    const memory = memoryStorage(plan())
    const queued: Array<() => void> = []
    const store = createGuestStore(memory.storage, undefined, (write) => queued.push(write))
    memory.fail()
    store.updatePlan((current) => ({ ...current, name: 'Voll' }))
    expect(store.getState().saveFailed).toBe(false)
    queued[0]?.()
    expect(store.getState().saveFailed).toBe(true)
  })
})
