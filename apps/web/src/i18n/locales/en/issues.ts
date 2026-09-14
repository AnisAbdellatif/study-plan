import type { issues as de } from '../de/issues.ts'
import type { Messages } from '../types.ts'

export const issues = {
  season: {
    winter: 'winter semester',
    summer: 'summer semester',
  },
  or: ' or ',
  and: ' and ',
  wrongTerm: '{{name}} is only offered in the {{season}}, but it is planned for {{term}}.',
  wrongTermCard: 'Only offered in the {{season}}',
  irregularOffering: '{{name}} is offered irregularly. Check the current course catalogue.',
  irregularOfferingCard: 'Offered irregularly',
  prerequisiteNotPassed:
    '{{name}} requires modules that were not passed in time. {{reasons}} Move {{name}} to a later semester, or enter the result if you did pass.',
  prerequisiteNotPassedCard: 'Prerequisite not passed: {{prerequisites}}',
  prerequisiteSemesterOver: '{{prerequisite}} was planned for {{term}} and is not passed.',
  prerequisiteExhausted: '{{prerequisite}} can no longer be passed because all attempts are used.',
  missingPrerequisite: '{{name}} requires {{missing}}. Plan that earlier.',
  missingPrerequisiteCard: 'Missing prerequisite: {{missing}}',
  notEnoughCredits: '{{name}} requires {{required}}, but only {{available}} are planned by then.',
  notEnoughCreditsCard: 'Requires {{required}}',
  attemptsExhausted:
    "{{name}}: all {{max}} attempts are used up without passing. For compulsory and elective modules this usually means you've failed for good. Talk to the examination office or student advisory service.",
  attemptsExhaustedCard: 'No attempts left',
  lastAttempt: '{{name}}: only one of {{max}} attempts left.',
  lastAttemptSupplementaryGraded:
    'If you fail a written exam on your last attempt, you first get a supplementary oral exam, after which {{grade}} is the best possible grade.',
  lastAttemptSupplementaryPassFail:
    'If you fail a written exam on your last attempt, you first get a supplementary oral exam, after which only "passed" is possible.',
  lastAttemptCard: 'Last attempt',
  retakenAfterPass:
    '{{name}} is entered again after passing. Under the examination regulations, passed exams can’t be retaken.',
  retakenAfterPassCard: 'Retaken after passing',
  alternativesConflict:
    '{{names}} exclude each other. Only one of them counts under the examination regulations, so plan just one.',
  alternativesConflictCard: 'Only one of the alternatives is possible',
  areaBelowMinimum: '{{area}}: {{planned}} planned out of at least {{min}}.',
  areaAboveMaximum: '{{area}}: {{planned}} planned, but at most {{max}} are allowed.',
  recognitionPlanned: 'You plan to have {{name}} recognised. Apply to the examination office in good time.',
  recognitionRequested:
    'Recognition of {{name}} has been requested. Its credits don’t count until it’s decided.',
  recognitionRejected: 'Recognition of {{name}} was rejected. Plan the module to take it yourself.',
  recognitionWithoutResult:
    '{{name}} is recognised but has no result yet. Enter the recognised grade or “passed” so its credits count.',
  recognitionWithoutResultCard: 'Recognised, result missing',
  leaveSemesterModules:
    '{{term}} is a leave semester, but {{names}} is planned in it. Your examination regulations say whether exams are allowed during a leave semester.',
} satisfies Messages<typeof de>
