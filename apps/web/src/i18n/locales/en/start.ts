import type { start as de } from '../de/start.ts'
import type { Messages } from '../types.ts'

export const start = {
  title: 'Create your study plan',
  intro:
    'Choose your programme and your start of studies. Modules are sorted into semesters following the recommended study plan, and you can move them freely afterwards.',
  highlights: {
    noAccount: 'No account needed',
    local: 'Your plan stays in your browser',
    editable: 'Change it any time',
  },
  methods: {
    label: 'How to add your programme',
    template: 'Template',
    file: 'File',
    llm: 'With AI',
  },
  llm: {
    progress: 'Progress',
    done: 'done',
    steps: {
      describe: 'Describe',
      prompt: 'Use the prompt',
      answer: 'Check the answer',
      create: 'Create plan',
    },
  },
  other: {
    heading: 'Or start like this',
    exampleTitle: 'Just try it out',
    importTitle: 'Open a saved plan',
  },
  loadError:
    'Your saved plan couldn’t be read. A copy of the data stays in the browser. You can import an exported plan or start over.',
  dismiss: 'Dismiss',
  tryExample: 'Try it with an example',
  exampleNote:
    'The example is a made-up computer science programme that isn’t based on any real examination regulations. Your plan starts in the current or next winter semester.',
  startTerm: 'Start of studies',
  winter: 'Winter semester',
  summer: 'Summer semester',
  year: 'Year',
  semesterTerm: 'Semester {{number}}: {{term}}',
  import: 'Restore a saved plan',
  importNote:
    'For a plan file you saved earlier with “Export”. It contains your whole plan with grades and placements. A programme file from a language model goes into the “File” tab above instead.',
  presets: {
    heading: 'Choose your programme',
    intro:
      'Some programmes have ready-made presets. Search by university, programme, degree or examination regulations version.',
    label: 'Search programmes',
    placeholder: 'e.g. Informatik Hannover',
    hint: 'Use the arrow keys to highlight a match and Enter to pick it.',
    results_one: '{{count}} programme found',
    results_other: '{{count}} programmes found',
    noMatches: 'No programme matches your search.',
    loading: 'Loading programmes…',
    empty: 'No programmes have been added yet.',
    loadError:
      'The programmes couldn’t be loaded right now. You can still load your programme from a file or create it with a language model in the tabs above.',
    loadingPreset: 'Loading programme…',
    presetError: 'This programme couldn’t be loaded. Pick it again to retry.',
    alternatives:
      'Your programme isn’t listed? Load a programme file or create one with a language model, both in the tabs above.',
  },
  programmeFile: {
    heading: 'Load programme from file',
    intro:
      'Already have a programme file, for example the programme.json a language model created with our prompt, or a file from someone in your programme? Load it directly here. University, programme and degree are in the file, so you don’t need to enter them.',
    choose: 'Choose programme file',
    fileInput: 'Choose a programme file (JSON)',
    loaded: 'Loaded: {{name}}',
    notABackup:
      'The file only contains the programme’s modules and rules, no grades. It creates a new, empty plan.',
    readError: 'The file couldn’t be read.',
  },
  orSteps:
    'Your programme isn’t there? Create it in four steps with a language model of your choice, such as ChatGPT, Claude or Gemini.',
  haveAccount: 'Already have an account?',
  signIn: 'Sign in',
  backToPlan: 'Back to your plan',
  replace: {
    title: 'Replace your current plan?',
    description:
      'This browser already has a plan. The new plan replaces it, including all grades you entered. Export the old plan first if you want to keep it.',
    confirm: 'Replace',
  },
} satisfies Messages<typeof de>
