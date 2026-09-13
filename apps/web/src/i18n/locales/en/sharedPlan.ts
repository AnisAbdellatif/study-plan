import type { sharedPlan as de } from '../de/sharedPlan.ts'
import type { Messages } from '../types.ts'

export const sharedPlan = {
  eyebrow: 'Shared plan',
  lastChanged: 'Last changed {{time}}. Without grades, exam dates or target average.',
  adopt: 'Use as my own plan',
  semester: 'Semester {{number}}',
  backlog: 'Not scheduled',
  replace: {
    title: 'Replace your plan?',
    description:
      '“{{name}}” replaces your plan in this browser, including the grades you entered. Export your plan first if you want to keep it.',
    descriptionLinked:
      '“{{name}}” replaces your plan in this browser and in your account, including the grades you entered. Export your plan first if you want to keep it.',
    confirm: 'Replace',
  },
  loading: 'Loading plan…',
  unavailable: 'Link not available',
  notFound: 'This link has been deactivated or doesn’t exist.',
  loadFailed: 'The plan couldn’t be loaded just now. Please try again later.',
  createOwn: 'Create your own plan',
} satisfies Messages<typeof de>
