import type { start as de } from '../de/start.ts'
import type { Messages } from '../types.ts'

export const start = {
  title: 'Create your study plan',
  intro:
    'Choose your degree programme and your first semester. Modules are pre-sorted following the module handbook, and you can move them freely afterwards. You don’t need an account: your plan is only saved in this browser.',
  loadError:
    'Your saved plan couldn’t be read. A copy of the data stays in the browser. You can import an exported plan or start over.',
  dismiss: 'Dismiss',
  programme: 'Degree programme',
  fictional: '(fictional example)',
  semesterCount_one: '{{count}} semester',
  semesterCount_other: '{{count}} semesters',
  fictionalNote: 'Made up, not based on any real examination regulations.',
  startTerm: 'Start of studies',
  winter: 'Winter semester',
  summer: 'Summer semester',
  year: 'Year',
  semesterTerm: 'Semester {{number}}: {{term}}',
  submit: 'Create plan',
  import: 'Import plan from file',
  haveAccount: 'Already have an account? Sign in',
  backToPlan: 'Back to your plan',
  replace: {
    title: 'Replace your current plan?',
    description:
      'This browser already has a plan. The new plan replaces it, including all grades you entered. Export the old plan first if you want to keep it.',
    confirm: 'Replace',
  },
} satisfies Messages<typeof de>
