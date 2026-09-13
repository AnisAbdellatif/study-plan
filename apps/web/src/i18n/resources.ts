import { admin as deAdmin } from './locales/de/admin.ts'
import { auth as deAuth } from './locales/de/auth.ts'
import { board as deBoard } from './locales/de/board.ts'
import { common as deCommon } from './locales/de/common.ts'
import { customPreset as deCustomPreset } from './locales/de/customPreset.ts'
import { dialogs as deDialogs } from './locales/de/dialogs.ts'
import { issues as deIssues } from './locales/de/issues.ts'
import { legal as deLegal } from './locales/de/legal.ts'
import { sharedPlan as deSharedPlan } from './locales/de/sharedPlan.ts'
import { start as deStart } from './locales/de/start.ts'
import { admin as enAdmin } from './locales/en/admin.ts'
import { auth as enAuth } from './locales/en/auth.ts'
import { board as enBoard } from './locales/en/board.ts'
import { common as enCommon } from './locales/en/common.ts'
import { customPreset as enCustomPreset } from './locales/en/customPreset.ts'
import { dialogs as enDialogs } from './locales/en/dialogs.ts'
import { issues as enIssues } from './locales/en/issues.ts'
import { legal as enLegal } from './locales/en/legal.ts'
import { sharedPlan as enSharedPlan } from './locales/en/sharedPlan.ts'
import { start as enStart } from './locales/en/start.ts'

/**
 * Message files per locale and namespace. German is the reference: English files use `Messages<typeof de…>`,
 * so a missing or extra key fails the typecheck.
 */
export const resources = {
  de: {
    common: deCommon,
    customPreset: deCustomPreset,
    board: deBoard,
    dialogs: deDialogs,
    issues: deIssues,
    auth: deAuth,
    start: deStart,
    sharedPlan: deSharedPlan,
    admin: deAdmin,
    legal: deLegal,
  },
  en: {
    common: enCommon,
    customPreset: enCustomPreset,
    board: enBoard,
    dialogs: enDialogs,
    issues: enIssues,
    auth: enAuth,
    start: enStart,
    sharedPlan: enSharedPlan,
    admin: enAdmin,
    legal: enLegal,
  },
}

export const defaultNS = 'common'
