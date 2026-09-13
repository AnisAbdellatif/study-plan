import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema.ts'

export type Schema = typeof schema

/** The common Drizzle interface of both drivers. Application code only uses this. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>

export interface DatabaseConnection {
  db: Database
  migrate(): Promise<void>
  close(): Promise<void>
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * Opens PostgreSQL (postgres://…) or an embedded PGlite database (pglite://<directory> or pglite://memory).
 * PGlite runs real Postgres compiled to WebAssembly, so development and tests need no database server.
 */
export async function openDatabase(url: string): Promise<DatabaseConnection> {
  if (url.startsWith('pglite://')) {
    const location = url.slice('pglite://'.length)
    let client: PGlite
    if (location === 'memory') {
      client = new PGlite()
    } else {
      mkdirSync(location, { recursive: true })
      client = new PGlite(location)
    }
    await client.waitReady
    const db = drizzlePglite({ client, schema })
    return {
      db: db as unknown as Database,
      migrate: () => migratePglite(db, { migrationsFolder }),
      close: () => client.close(),
    }
  }

  const sql = postgres(url, { max: 10 })
  const db = drizzlePostgres({ client: sql, schema })
  return {
    db: db as unknown as Database,
    migrate: () => migratePostgres(db, { migrationsFolder }),
    close: () => sql.end(),
  }
}
