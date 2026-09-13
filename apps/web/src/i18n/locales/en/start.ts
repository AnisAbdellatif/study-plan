import type { start as de } from '../de/start.ts'
import type { Messages } from '../types.ts'

export const start = {
  title: 'Create your study plan',
  intro:
    'You add your own degree programme: a language model of your choice reads your examination regulations and module handbook, and your plan is created from its answer. Modules are pre-sorted following the recommended study plan, and you can move them freely afterwards. You don’t need an account: your plan is only saved in this browser.',
  loadError:
    'Your saved plan couldn’t be read. A copy of the data stays in the browser. You can import an exported plan or start over.',
  dismiss: 'Dismiss',
  tryExample: 'Try it with an example',
  exampleNote:
    'The example is a made-up computer science programme that isn’t based on any real examination regulations. Your plan starts in the current semester.',
  startTerm: 'Start of studies',
  winter: 'Winter semester',
  summer: 'Summer semester',
  year: 'Year',
  semesterTerm: 'Semester {{number}}: {{term}}',
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
