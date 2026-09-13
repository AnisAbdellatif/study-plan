import { defineConfig } from 'drizzle-kit'

// Only used to generate SQL migrations from src/db/schema.ts. The app applies them itself on startup.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
