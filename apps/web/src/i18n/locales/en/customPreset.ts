import type { customPreset as de } from '../de/customPreset.ts'
import type { Messages } from '../types.ts'

export const customPreset = {
  title: 'Add your own programme',
  intro:
    'Your programme isn’t listed? A language model of your choice reads the examination regulations and the module handbook for you. You then create your plan here from its answer.',
  back: 'Back to the selection',
  copied: 'Copied',
  copyFailed: 'Copying didn’t work. Select the text and copy it yourself.',
  describe: {
    heading: '1. Describe your programme',
    university: 'University',
    programme: 'Degree programme',
    degree: 'Degree',
    poVersion: 'Examination regulations version (optional)',
    poVersionHint: 'e.g. PO 2024',
    generate: 'Create prompt',
    regenerate: 'Update prompt',
    changed: 'You changed your details. Update the prompt so it matches them.',
  },
  prompt: {
    heading: '2. Give the prompt to a language model',
    stepCopy: 'Copy the prompt or download it as a file.',
    stepOpen:
      'Open a language model of your choice that can read PDFs, for example ChatGPT, Claude, Gemini or Le Chat.',
    stepAttach:
      'Attach the examination regulations (Prüfungsordnung, with amendments and annexes) and the module handbook (Modulkatalog or Modulhandbuch), plus the recommended study plan if it’s a separate document.',
    stepSend: 'Send the prompt.',
    stepAnswer: 'Copy the complete answer and paste it below.',
    label: 'Prompt',
    copy: 'Copy prompt',
    download: 'Download as file',
    english:
      'The prompt is in English on purpose, because language models follow English instructions most reliably. Names and texts still stay in the language of your documents.',
    privacy:
      'The study planner doesn’t send anything to a language model. You choose the model yourself. Check its privacy terms before you upload documents.',
  },
  answer: {
    heading: '3. Paste the answer',
    label: 'Answer from the language model',
    loadFile: 'Load from file',
    fileInput: 'Choose a file with the answer',
    fileError: 'The file couldn’t be read.',
    check: 'Check answer',
  },
  errors: {
    title: 'The answer doesn’t fit yet',
    empty: 'The answer field is empty. Paste the complete answer from the language model.',
    no_json:
      'The answer doesn’t contain any JSON. Maybe the language model asked a question or couldn’t read the documents. Read its answer and ask it to provide the JSON.',
    invalid_json:
      'The JSON in the answer is broken, for example incomplete or missing quotes. Often the answer was cut off midway.',
    invalid_preset: 'The JSON doesn’t match the expected structure. These places are affected:',
    more_one: 'and {{count}} more',
    more_other: 'and {{count}} more',
    copyReport: 'Copy error report for the language model',
    reportHint: 'Send the error report in the same chat and paste the new answer above.',
  },
  preview: {
    title: 'The answer fits',
    intro: 'This is what the language model read from your documents:',
    programme: 'Degree programme',
    degree: 'Degree',
    university: 'University',
    poVersion: 'Examination regulations',
    handbookVersion: 'Module handbook',
    standardSemesters: 'Standard period of study',
    semesterCount_one: '{{count}} semester',
    semesterCount_other: '{{count}} semesters',
    totalCredits: 'Total credits',
    modules: 'Modules',
    moduleCount_one: '{{count}} module: {{graded}} graded, {{ungraded}} ungraded',
    moduleCount_other: '{{count}} modules: {{graded}} graded, {{ungraded}} ungraded',
    details: 'Module descriptions',
    detailsCount_one: '{{count}} of {{total}} modules have details from the module handbook',
    detailsCount_other: '{{count}} of {{total}} modules have details from the module handbook',
    areas: 'Areas',
    areaMin: '{{name}}: at least {{min}} {{label}}',
    areaRange: '{{name}}: {{min}} to {{max}} {{label}}',
    rounding: 'Final grade',
    examRules: 'Exams',
    withdrawal_one: 'Withdrawal up to {{count}} day before the exam',
    withdrawal_other: 'Withdrawal up to {{count}} days before the exam',
    attempts_one: '{{count}} attempt per exam',
    attempts_other: '{{count}} attempts per exam',
    warningsTitle: 'Please check',
    notes: 'Notes from the language model',
    checkHint:
      'Compare the result with your examination regulations. If something is wrong, describe the mistake to the language model in the same chat and paste the corrected answer above again.',
    downloadTemplate: 'Download template (JSON)',
  },
  warnings: {
    modules_without_area_one: '{{count}} module doesn’t belong to any area: {{codes}}',
    modules_without_area_other: '{{count}} modules don’t belong to any area: {{codes}}',
    modules_without_semester_one:
      '{{count}} module has no recommended semester and ends up under “Not scheduled”: {{codes}}',
    modules_without_semester_other:
      '{{count}} modules have no recommended semester and end up under “Not scheduled”: {{codes}}',
    modules_without_details_one: '{{count}} module has no details from the module handbook: {{codes}}',
    modules_without_details_other: '{{count}} modules have no details from the module handbook: {{codes}}',
  },
  create: {
    heading: '4. Create the plan',
    submit: 'Create plan',
  },
} satisfies Messages<typeof de>
