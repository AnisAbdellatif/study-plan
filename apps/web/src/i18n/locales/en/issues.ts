import type { issues as de } from '../de/issues.ts'
import type { Messages } from '../types.ts'

export const issues = {} satisfies Messages<typeof de>
