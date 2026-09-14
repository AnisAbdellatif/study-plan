import { addTerms, formatTerm, type Plan, type PlanIssue, type Prerequisite } from '@study-plan/shared'
import i18n, { currentLocale } from '../i18n/index.ts'
import { formatCredits, formatGrade } from './format.ts'

export interface IssueText {
  severity: PlanIssue['severity']
  text: string
}

export interface DescribedIssues {
  /** Short notes shown on module cards, keyed by module code. */
  byModule: Map<string, IssueText[]>
  /** Full sentences for the hints panel, warnings first. */
  list: IssueText[]
}

const season = (offering: 'winter' | 'summer') => i18n.t(`issues:season.${offering}`)

export function describeIssues(plan: Plan, issues: readonly PlanIssue[]): DescribedIssues {
  const t = i18n.t
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const nameOf = (code: string) => names.get(code) ?? code
  const graded = (code: string) => plan.modules.find((module) => module.code === code)?.grading === 'graded'
  const areaName = (id: string) => plan.areas.find((area) => area.id === id)?.name ?? id
  const credits = (value: number) => `${formatCredits(value)} ${plan.preset.creditLabel}`
  const prerequisite = (item: Prerequisite) =>
    typeof item === 'string' ? nameOf(item) : item.anyOf.map(nameOf).join(t('issues:or'))

  const byModule = new Map<string, IssueText[]>()
  const list: IssueText[] = []
  const add = (severity: PlanIssue['severity'], text: string, code?: string, cardText?: string) => {
    list.push({ severity, text })
    if (code && cardText) byModule.set(code, [...(byModule.get(code) ?? []), { severity, text: cardText }])
  }

  for (const issue of issues) {
    switch (issue.kind) {
      case 'wrong_term':
        add(
          issue.severity,
          t('issues:wrongTerm', {
            name: nameOf(issue.code),
            season: season(issue.offering),
            term: formatTerm(issue.term, currentLocale()),
          }),
          issue.code,
          t('issues:wrongTermCard', { season: season(issue.offering) }),
        )
        break
      case 'irregular_offering':
        add(
          issue.severity,
          t('issues:irregularOffering', { name: nameOf(issue.code) }),
          issue.code,
          t('issues:irregularOfferingCard'),
        )
        break
      case 'prerequisite_not_passed': {
        const names = issue.blocked.map((item) => nameOf(item.code))
        const reasons = issue.blocked.map((item) => {
          const semesterIndex = plan.semesters.findIndex((semester) =>
            semester.moduleCodes.includes(item.code),
          )
          const term =
            semesterIndex === -1 ? '' : formatTerm(addTerms(plan.startTerm, semesterIndex), currentLocale())
          return item.reason === 'exhausted'
            ? t('issues:prerequisiteExhausted', { prerequisite: nameOf(item.code) })
            : t('issues:prerequisiteSemesterOver', { prerequisite: nameOf(item.code), term })
        })
        add(
          issue.severity,
          t('issues:prerequisiteNotPassed', { name: nameOf(issue.code), reasons: reasons.join(' ') }),
          issue.code,
          t('issues:prerequisiteNotPassedCard', { prerequisites: names.join(', ') }),
        )
        break
      }
      case 'missing_prerequisite': {
        const missing = issue.missing.map(prerequisite)
        add(
          issue.severity,
          t('issues:missingPrerequisite', {
            name: nameOf(issue.code),
            missing: missing.join(t('issues:and')),
          }),
          issue.code,
          t('issues:missingPrerequisiteCard', { missing: missing.join(', ') }),
        )
        break
      }
      case 'not_enough_credits':
        add(
          issue.severity,
          t('issues:notEnoughCredits', {
            name: nameOf(issue.code),
            required: credits(issue.required),
            available: credits(issue.available),
          }),
          issue.code,
          t('issues:notEnoughCreditsCard', { required: credits(issue.required) }),
        )
        break
      case 'attempts_exhausted':
        add(
          issue.severity,
          t('issues:attemptsExhausted', { name: nameOf(issue.code), max: issue.maxAttempts }),
          issue.code,
          t('issues:attemptsExhaustedCard'),
        )
        break
      case 'last_attempt': {
        const sentences = [t('issues:lastAttempt', { name: nameOf(issue.code), max: issue.maxAttempts })]
        if (issue.supplementaryExam) {
          sentences.push(
            graded(issue.code)
              ? t('issues:lastAttemptSupplementaryGraded', { grade: formatGrade(4) })
              : t('issues:lastAttemptSupplementaryPassFail'),
          )
        }
        add(issue.severity, sentences.join(' '), issue.code, t('issues:lastAttemptCard'))
        break
      }
      case 'retaken_after_pass':
        add(
          issue.severity,
          t('issues:retakenAfterPass', { name: nameOf(issue.code) }),
          issue.code,
          t('issues:retakenAfterPassCard'),
        )
        break
      case 'alternatives_conflict': {
        // One sentence in the list, and a short note on every card involved.
        list.push({
          severity: issue.severity,
          text: t('issues:alternativesConflict', { names: issue.codes.map(nameOf).join(t('issues:and')) }),
        })
        for (const code of issue.codes) {
          byModule.set(code, [
            ...(byModule.get(code) ?? []),
            { severity: issue.severity, text: t('issues:alternativesConflictCard') },
          ])
        }
        break
      }
      // Pending and rejected recognitions show as a badge on the card, so they only get a sentence in the list.
      case 'recognition_pending':
        add(
          issue.severity,
          t(issue.status === 'planned' ? 'issues:recognitionPlanned' : 'issues:recognitionRequested', {
            name: nameOf(issue.code),
          }),
        )
        break
      case 'recognition_rejected':
        add(issue.severity, t('issues:recognitionRejected', { name: nameOf(issue.code) }))
        break
      case 'recognition_without_result':
        add(
          issue.severity,
          t('issues:recognitionWithoutResult', { name: nameOf(issue.code) }),
          issue.code,
          t('issues:recognitionWithoutResultCard'),
        )
        break
      case 'leave_semester_modules': {
        const index = Math.max(
          0,
          plan.semesters.findIndex((semester) => semester.id === issue.semesterId),
        )
        add(
          issue.severity,
          t('issues:leaveSemesterModules', {
            term: formatTerm(addTerms(plan.startTerm, index), currentLocale()),
            names: issue.codes.map(nameOf).join(', '),
          }),
        )
        break
      }
      case 'area_below_minimum':
        add(
          issue.severity,
          t('issues:areaBelowMinimum', {
            area: areaName(issue.areaId),
            planned: credits(issue.planned),
            min: credits(issue.minCredits),
          }),
        )
        break
      case 'area_above_maximum':
        add(
          issue.severity,
          t('issues:areaAboveMaximum', {
            area: areaName(issue.areaId),
            planned: credits(issue.planned),
            max: credits(issue.maxCredits),
          }),
        )
        break
    }
  }

  const rank = { error: 0, warning: 1, info: 2 } as const
  list.sort((a, b) => rank[a.severity] - rank[b.severity])
  return { byModule, list }
}
