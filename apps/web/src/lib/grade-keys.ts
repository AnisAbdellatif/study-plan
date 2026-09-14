import { deriveGradeKey, PBKDF2_ITERATIONS } from './grade-crypto.ts'

export interface GradeKeys {
  current: CryptoKey
  /** The key before the last sign-in, for grades encrypted before a password reset. */
  previous?: CryptoKey
}

/** Where a device keeps the grade keys of its accounts. */
export interface GradeKeyStore {
  get(userId: string): Promise<GradeKeys | null>
  set(userId: string, keys: GradeKeys): Promise<void>
  remove(userId: string): Promise<void>
}

export function memoryKeyStore(): GradeKeyStore {
  const keys = new Map<string, GradeKeys>()
  return {
    get: async (userId) => keys.get(userId) ?? null,
    set: async (userId, value) => {
      keys.set(userId, value)
    },
    remove: async (userId) => {
      keys.delete(userId)
    },
  }
}

const DATABASE = 'study-plan-keys'
const STORE = 'grade-keys'

/**
 * IndexedDB, which stores the non-extractable CryptoKey objects themselves, so the raw key never exists as data.
 * Without IndexedDB (private windows in some browsers) keys last until the page is closed.
 */
export function browserKeyStore(): GradeKeyStore {
  const fallback = memoryKeyStore()
  if (typeof indexedDB === 'undefined') return fallback

  let opening: Promise<IDBDatabase> | null = null
  const database = (): Promise<IDBDatabase> => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return opening
  }
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await database()
    return new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async get(userId) {
      try {
        const stored = (await run('readonly', (store) => store.get(userId))) as GradeKeys | undefined
        return stored ?? (await fallback.get(userId))
      } catch {
        return fallback.get(userId)
      }
    },
    async set(userId, keys) {
      try {
        await run('readwrite', (store) => store.put(keys, userId))
      } catch {
        await fallback.set(userId, keys)
      }
    },
    async remove(userId) {
      await fallback.remove(userId)
      try {
        await run('readwrite', (store) => store.delete(userId))
      } catch {
        // Nothing was stored.
      }
    },
  }
}

/** The grade keys of this device, including derivations still running right after a sign-in. */
export class GradeKeyring {
  readonly #store: GradeKeyStore
  readonly #iterations: number
  readonly #pending = new Map<string, Promise<void>>()

  constructor(store: GradeKeyStore, options: { iterations?: number } = {}) {
    this.#store = store
    this.#iterations = options.iterations ?? PBKDF2_ITERATIONS
  }

  /**
   * After signing in or up: derives the key from the password and keeps it on this device. The key used so far
   * stays as the previous one, for grades encrypted before a password reset.
   */
  remember(password: string, userId: string): Promise<void> {
    return this.#track(
      userId,
      (async () => {
        const current = await deriveGradeKey(password, userId, this.#iterations)
        const existing = await this.#store.get(userId)
        await this.#store.set(userId, existing ? { current, previous: existing.current } : { current })
      })(),
    )
  }

  /** A password from before a reset, to read grades encrypted with it. The current key stays. */
  rememberPrevious(password: string, userId: string): Promise<void> {
    return this.#track(
      userId,
      (async () => {
        const previous = await deriveGradeKey(password, userId, this.#iterations)
        const existing = await this.#store.get(userId)
        await this.#store.set(
          userId,
          existing ? { current: existing.current, previous } : { current: previous },
        )
      })(),
    )
  }

  /** The keys for an account; waits for a derivation that is still running. */
  async keys(userId: string): Promise<GradeKeys | null> {
    await this.#pending.get(userId)?.catch(() => undefined)
    return this.#store.get(userId)
  }

  /** On sign-out and account deletion: this device can no longer read the grades. */
  forget(userId: string): Promise<void> {
    this.#pending.delete(userId)
    return this.#store.remove(userId)
  }

  #track(userId: string, task: Promise<void>): Promise<void> {
    this.#pending.set(userId, task)
    task
      .finally(() => {
        if (this.#pending.get(userId) === task) this.#pending.delete(userId)
      })
      .catch(() => undefined)
    return task
  }
}
