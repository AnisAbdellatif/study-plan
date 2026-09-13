import { createPlanFromPreset, type GuestDocument, moveModule } from '@study-plan/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { findPreset } from '../presets.ts'
import { createGuestStore, type StorageLike } from '../store/guest-store.ts'
import { ApiError, type PlanSummary, type SaveResult, type StoredPlan } from './api.ts'
import { LINK_KEY, PlanSync } from './plan-sync.ts'

const preset = findPreset('example/informatik-bsc-example')?.preset
if (!preset) throw new Error('expected the example preset')

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

let tick = 0
const nextTime = () => new Date(Date.UTC(2026, 8, 13, 10, 0, tick++)).toISOString()

const newPlan = (name = 'Browserplan') =>
  createPlanFromPreset(preset, {
    id: 'local',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date(nextTime()),
    name,
  })

function fakeApi() {
  const plans = new Map<string, StoredPlan>()
  let sequence = 0
  let offline = false
  const summary = ({ document: _document, ...rest }: StoredPlan): PlanSummary => rest
  return {
    plans,
    setOffline(value: boolean) {
      offline = value
    },
    /** Simulates an edit saved from another device. */
    editElsewhere(id: string, change: (document: GuestDocument) => GuestDocument) {
      const current = plans.get(id)
      if (!current) throw new Error('no such plan')
      plans.set(id, {
        ...current,
        document: change(current.document),
        revision: current.revision + 1,
        updatedAt: nextTime(),
      })
    },
    async list() {
      if (offline) throw new TypeError('Failed to fetch')
      return [...plans.values()].map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async get(id: string) {
      if (offline) throw new TypeError('Failed to fetch')
      const plan = plans.get(id)
      if (!plan) throw new ApiError(404, 'not_found')
      return plan
    },
    async create(document: GuestDocument) {
      if (offline) throw new TypeError('Failed to fetch')
      const stored: StoredPlan = {
        id: `plan-${++sequence}`,
        name: document.plan.name,
        revision: 1,
        updatedAt: nextTime(),
        document,
      }
      plans.set(stored.id, stored)
      return summary(stored)
    },
    async update(id: string, document: GuestDocument, revision: number): Promise<SaveResult> {
      if (offline) throw new TypeError('Failed to fetch')
      const current = plans.get(id)
      if (!current) throw new ApiError(404, 'not_found')
      if (current.revision !== revision) return { status: 'conflict', current }
      const next = {
        ...current,
        document,
        name: document.plan.name,
        revision: revision + 1,
        updatedAt: nextTime(),
      }
      plans.set(id, next)
      return { status: 'saved', plan: summary(next) }
    },
  }
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function setup() {
  const storage = memoryStorage()
  const store = createGuestStore(storage, () => new Date(nextTime()))
  const api = fakeApi()
  const sync = new PlanSync({ store, api, storage, debounceMs: 0 })
  return { storage, store, api, sync }
}

describe('PlanSync', () => {
  beforeEach(() => {
    tick = 0
  })

  it('offers to upload the browser plan to an empty account and keeps it in sync afterwards', async () => {
    const { store, api, sync, storage } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    expect(sync.getState()).toEqual({ kind: 'no_account_plan' })

    await sync.uploadLocal()
    expect(sync.getState().kind).toBe('synced')
    expect(api.plans.size).toBe(1)
    expect(JSON.parse(storage.data.get(LINK_KEY) ?? '{}')).toMatchObject({
      userId: 'user-1',
      planId: 'plan-1',
      revision: 1,
    })

    store.updatePlan((plan) => moveModule(plan, 'INF-101', 's2'))
    await settle()
    expect(api.plans.get('plan-1')?.revision).toBe(2)
    expect(api.plans.get('plan-1')?.document.plan.semesters[1]?.moduleCodes).toContain('INF-101')
    expect(sync.getState().kind).toBe('synced')
  })

  it('loads the account plan on a device without a browser plan', async () => {
    const { store, api, sync } = setup()
    await api.create({ format: 'study-plan.guest', schemaVersion: 1, plan: newPlan('Kontoplan') })
    await sync.start('user-1')
    expect(store.getState().plan?.name).toBe('Kontoplan')
    expect(sync.getState().kind).toBe('synced')
    await settle()
    // Loading the account plan must not echo it back to the server.
    expect(api.plans.get('plan-1')?.revision).toBe(1)
  })

  it('asks which plan to keep when both exist, and applies either choice', async () => {
    const first = setup()
    await first.api.create({ format: 'study-plan.guest', schemaVersion: 1, plan: newPlan('Kontoplan') })
    first.store.replacePlan(newPlan('Browserplan'))
    await first.sync.start('user-1')
    expect(first.sync.getState()).toMatchObject({ kind: 'choose', remote: { name: 'Kontoplan' } })
    first.sync.loadAccountPlan()
    expect(first.store.getState().plan?.name).toBe('Kontoplan')

    const second = setup()
    await second.api.create({ format: 'study-plan.guest', schemaVersion: 1, plan: newPlan('Kontoplan') })
    second.store.replacePlan(newPlan('Browserplan'))
    await second.sync.start('user-1')
    await second.sync.keepBrowserPlan()
    expect(second.api.plans.get('plan-1')).toMatchObject({ name: 'Browserplan', revision: 2 })
    expect(second.sync.getState().kind).toBe('synced')
  })

  it('lets the server win a conflict and says so', async () => {
    const { store, api, sync } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    await sync.uploadLocal()

    api.editElsewhere('plan-1', (document) => ({
      ...document,
      plan: { ...document.plan, name: 'Vom Laptop' },
    }))
    store.updatePlan((plan) => moveModule(plan, 'INF-101', 's3'))
    await settle()

    expect(sync.getState()).toMatchObject({ kind: 'synced', notice: 'remote_newer' })
    expect(store.getState().plan?.name).toBe('Vom Laptop')
    expect(api.plans.get('plan-1')?.revision).toBe(2)
  })

  it('picks up newer account changes when it starts again', async () => {
    const { store, api, sync } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    await sync.uploadLocal()
    sync.stop()

    const restarted = new PlanSync({ store, api, storage: null, debounceMs: 0 })
    await restarted.start('user-1')
    // Signing out unlinks the plan, so a new session has to ask.
    expect(restarted.getState().kind).toBe('choose')
  })

  it('uploads offline edits on the next start when the link survived', async () => {
    const { store, api, sync, storage } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    await sync.uploadLocal()

    api.setOffline(true)
    store.updatePlan((plan) => moveModule(plan, 'INF-101', 's4'))
    await settle()
    expect(sync.getState()).toEqual({ kind: 'error' })

    api.setOffline(false)
    const reloaded = new PlanSync({ store, api, storage, debounceMs: 0 })
    await reloaded.start('user-1')
    await settle()
    expect(api.plans.get('plan-1')?.revision).toBe(2)
    expect(reloaded.getState().kind).toBe('synced')
  })

  it('loads a newer account revision on start when nothing changed locally', async () => {
    const { store, api, sync, storage } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    await sync.uploadLocal()
    api.editElsewhere('plan-1', (document) => ({
      ...document,
      plan: { ...document.plan, name: 'Vom Handy' },
    }))

    const reloaded = new PlanSync({ store, api, storage, debounceMs: 0 })
    await reloaded.start('user-1')
    expect(store.getState().plan?.name).toBe('Vom Handy')
  })

  it('retries after an error and forgets the link when another user signs in', async () => {
    const { store, api, sync, storage } = setup()
    store.replacePlan(newPlan())
    await sync.start('user-1')
    await sync.uploadLocal()
    api.setOffline(true)
    store.updatePlan((plan) => moveModule(plan, 'INF-101', 's5'))
    await settle()
    api.setOffline(false)
    await sync.retry()
    expect(api.plans.get('plan-1')?.revision).toBe(2)

    const other = new PlanSync({ store, api, storage, debounceMs: 0 })
    await other.start('user-2')
    expect(storage.data.get(LINK_KEY)).toBeUndefined()
  })
})
