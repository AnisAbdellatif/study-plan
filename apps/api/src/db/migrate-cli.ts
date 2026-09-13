import { loadConfig } from '../config.ts'
import { openDatabase } from './connection.ts'

const config = loadConfig()
const database = await openDatabase(config.databaseUrl)
await database.migrate()
await database.close()
console.info('[db] migrations applied')
