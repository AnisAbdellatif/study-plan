import { formatTerm, type Plan, type PlanIssue, type Prerequisite } from '@study-plan/shared'
import { formatCredits } from './format.ts'

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

const season = (offering: 'winter' | 'summer') =>
  offering === 'winter' ? 'Wintersemester' : 'Sommersemester'

export function describeIssues(plan: Plan, issues: readonly PlanIssue[]): DescribedIssues {
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const nameOf = (code: string) => names.get(code) ?? code
  const areaName = (id: string) => plan.areas.find((area) => area.id === id)?.name ?? id
  const credits = (value: number) => `${formatCredits(value)} ${plan.preset.creditLabel}`
  const prerequisite = (item: Prerequisite) =>
    typeof item === 'string' ? nameOf(item) : item.anyOf.map(nameOf).join(' oder ')

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
          `${nameOf(issue.code)} wird nur im ${season(issue.offering)} angeboten, ist aber im ${formatTerm(issue.term)} geplant.`,
          issue.code,
          `Nur im ${season(issue.offering)} angeboten`,
        )
        break
      case 'irregular_offering':
        add(
          issue.severity,
          `${nameOf(issue.code)} wird unregelmäßig angeboten. Prüfe das aktuelle Lehrangebot.`,
          issue.code,
          'Wird unregelmäßig angeboten',
        )
        break
      case 'missing_prerequisite': {
        const missing = issue.missing.map(prerequisite)
        add(
          issue.severity,
          `${nameOf(issue.code)} setzt ${missing.join(' und ')} voraus. Plane das vorher ein.`,
          issue.code,
          `Voraussetzung fehlt: ${missing.join(', ')}`,
        )
        break
      }
      case 'not_enough_credits':
        add(
          issue.severity,
          `${nameOf(issue.code)} setzt ${credits(issue.required)} voraus, bis dahin sind ${credits(issue.available)} eingeplant.`,
          issue.code,
          `Erst ab ${credits(issue.required)}`,
        )
        break
      case 'area_below_minimum':
        add(
          issue.severity,
          `${areaName(issue.areaId)}: ${credits(issue.planned)} von mindestens ${credits(issue.minCredits)} eingeplant.`,
        )
        break
      case 'area_above_maximum':
        add(
          issue.severity,
          `${areaName(issue.areaId)}: ${credits(issue.planned)} eingeplant, vorgesehen sind höchstens ${credits(issue.maxCredits)}.`,
        )
        break
    }
  }

  list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1))
  return { byModule, list }
}
