import type { ModuleDetails } from './preset.ts'

/** A list item: "- ", "• ", "1. " and the like. */
const BULLET = /^(?:[-–—•*]|\d+[.)])\s+/

/**
 * A catalog text as paragraphs instead of the PDF's lines. Extraction often keeps every line break of the
 * document, which tears sentences apart. Single line breaks inside a paragraph are therefore joined again;
 * blank lines and list items keep their break.
 */
export function tidyCatalogText(value: string): string {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
  const out: string[] = []
  for (const line of lines) {
    const previous = out.at(-1)
    if (line === '') {
      // One blank line at most, and none before the first paragraph.
      if (previous !== undefined && previous !== '') out.push('')
      continue
    }
    if (previous === undefined || previous === '' || BULLET.test(line)) {
      out.push(line)
      continue
    }
    out[out.length - 1] = `${previous} ${line}`
  }
  while (out.at(-1) === '') out.pop()
  return out.join('\n')
}

const tidyList = (items: readonly string[] | undefined): string[] | undefined =>
  items?.map((item) => tidyCatalogText(item))

const tidy = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : tidyCatalogText(value)

/** Every text of a module's catalog entry, tidied. Fields the entry doesn't fill stay missing. */
export function tidyModuleDetails(details: ModuleDetails): ModuleDetails {
  const defined = <T>(value: T | undefined, key: string): Record<string, T> =>
    value === undefined ? {} : ({ [key]: value } as Record<string, T>)
  return {
    ...details,
    ...defined(tidy(details.learningOutcomes), 'learningOutcomes'),
    ...defined(tidy(details.content), 'content'),
    ...defined(tidy(details.participationRequirements), 'participationRequirements'),
    ...defined(tidy(details.recommendedPrerequisites), 'recommendedPrerequisites'),
    ...defined(tidy(details.gradingNote), 'gradingNote'),
    ...defined(tidy(details.teachingMethods), 'teachingMethods'),
    ...defined(tidy(details.usability), 'usability'),
    ...defined(tidy(details.remarks), 'remarks'),
    ...defined(tidyList(details.literature), 'literature'),
    ...defined(tidyList(details.courseworkRequirements), 'courseworkRequirements'),
    ...defined(tidyList(details.examForms), 'examForms'),
    ...defined(
      details.additionalFields?.map((field) => ({ ...field, value: tidyCatalogText(field.value) })),
      'additionalFields',
    ),
  }
}
