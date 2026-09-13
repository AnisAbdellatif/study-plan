import type { common as de } from '../de/common.ts'
import type { Messages } from '../types.ts'

export const common = {
  brand: 'Study Planner',
  description: 'Plan your modules and track your grade average at a German university',
  language: {
    label: 'Language',
    current: 'Language: {{language}}',
    de: 'Deutsch',
    en: 'English',
  },
  footer: {
    legalNotice: 'Legal notice',
    privacy: 'Privacy',
  },
  actions: {
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
  },
  loading: 'Loading…',
  relativeDays: {
    today: 'today',
    tomorrow: 'tomorrow',
    inDays_one: 'in {{count}} day',
    inDays_other: 'in {{count}} days',
  },
  rounding: {
    truncateOne: 'truncated after the first decimal',
    truncateTwo: 'truncated after the second decimal',
    roundHalfUpOne: 'rounded to one decimal',
    roundHalfUpTwo: 'rounded to two decimals',
    nearestAllowed: 'rounded to the nearest allowed grade',
  },
} satisfies Messages<typeof de>
