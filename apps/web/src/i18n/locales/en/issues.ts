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
  areaBelowMinimum: '{{area}}: {{planned}} planned out of at least {{min}}.',
  areaAboveMaximum: '{{area}}: {{planned}} planned, but at most {{max}} are allowed.',
} satisfies Messages<typeof de>
