import type { Plan } from '@study-plan/shared'

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const exportFilename = (plan: Plan, date: Date): string =>
  `study-plan-${slugify(plan.name) || 'export'}-${date.toISOString().slice(0, 10)}.json`

export const calendarFilename = (plan: Plan): string => `exam-dates-${slugify(plan.name) || 'study-plan'}.ics`

/** Triggers a browser download of text content. */
export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Triggers a browser download of `data` as pretty-printed JSON. */
export const downloadJson = (filename: string, data: unknown): void =>
  downloadFile(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json')
