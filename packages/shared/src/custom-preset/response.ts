import { type Preset, presetSchema } from '../schema/preset.ts'

/** What the student tells us before generating the prompt. Their names win over what the LLM returns. */
export interface CustomProgrammeInput {
  universityName: string
  programmeName: string
  degree: 'bsc' | 'msc'
  /** Optional, e.g. "PO 2024". Falls back to the version the LLM found in the documents. */
  poVersion?: string
}

export interface CustomPresetIssue {
  /** e.g. "modules[3].credits", empty for the whole document */
  path: string
  message: string
}

export type CustomPresetWarning =
  | { kind: 'modules_without_area'; codes: string[] }
  | { kind: 'modules_without_semester'; codes: string[] }
  | { kind: 'modules_without_details'; codes: string[] }

export interface CustomPresetFailure {
  success: false
  reason: 'empty' | 'no_json' | 'invalid_json' | 'invalid_preset'
  issues: CustomPresetIssue[]
}

export type CustomPresetResult =
  | { success: true; preset: Preset; warnings: CustomPresetWarning[] }
  | CustomPresetFailure

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** "Leibniz Universität Hannover" -> "leibniz-universitaet-hannover" */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || fallback
}

/**
 * The JSON object inside an LLM answer: the first ```json fence, otherwise any fence, otherwise the text from
 * the first "{" to the last "}".
 */
export function extractJson(text: string): string | null {
  const fences = [...text.matchAll(/```([a-zA-Z]*)[ \t]*\r?\n([\s\S]*?)```/g)]
  const fenced = fences.find((match) => match[1]?.toLowerCase() === 'json') ?? fences[0]
  if (fenced?.[2]?.trim().startsWith('{')) return fenced[2].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : null
}

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (result, segment) =>
      typeof segment === 'number'
        ? `${result}[${segment}]`
        : result
          ? `${result}.${String(segment)}`
          : String(segment),
    '',
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Parses and validates an LLM answer for a custom programme. The id, university and programme come from the
 * student's input, so they never clash with bundled presets; `idSuffix` should be random.
 */
export function parseCustomPreset(
  text: string,
  input: CustomProgrammeInput,
  idSuffix: string,
): CustomPresetResult {
  if (text.trim() === '') return { success: false, reason: 'empty', issues: [] }
  const json = extractJson(text)
  if (json === null) return { success: false, reason: 'no_json', issues: [] }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (error) {
    return {
      success: false,
      reason: 'invalid_json',
      issues: [{ path: '', message: error instanceof Error ? error.message : String(error) }],
    }
  }
  if (!isRecord(data)) {
    return {
      success: false,
      reason: 'invalid_json',
      issues: [{ path: '', message: 'Expected a JSON object' }],
    }
  }

  const universitySlug = slugify(input.universityName, 'university')
  const programmeSlug = slugify(`${input.programmeName}-${input.degree}`, 'programme')
  const { $schema: _schema, transitions: _transitions, ...rest } = data
  const candidate = {
    ...rest,
    schemaVersion: 1,
    id: `custom/${programmeSlug.slice(0, 40)}-${slugify(idSuffix, 'x')}`,
    university: { slug: universitySlug, name: input.universityName.trim() },
    programme: { slug: programmeSlug, name: input.programmeName.trim(), degree: input.degree },
    ...(input.poVersion?.trim() ? { poVersion: input.poVersion.trim() } : {}),
  }

  const result = presetSchema.safeParse(candidate)
  if (!result.success) {
    return {
      success: false,
      reason: 'invalid_preset',
      issues: result.error.issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
    }
  }
  return { success: true, preset: result.data, warnings: presetWarnings(result.data) }
}

function presetWarnings(preset: Preset): CustomPresetWarning[] {
  const warnings: CustomPresetWarning[] = []
  const inArea = new Set(preset.areas.flatMap((area) => area.moduleCodes))
  const withoutArea = preset.areas.length > 0 ? preset.modules.filter((m) => !inArea.has(m.code)) : []
  if (withoutArea.length > 0) {
    warnings.push({ kind: 'modules_without_area', codes: withoutArea.map((m) => m.code) })
  }
  const withoutSemester = preset.modules.filter((m) => m.typicalSemester === undefined)
  if (withoutSemester.length > 0) {
    warnings.push({ kind: 'modules_without_semester', codes: withoutSemester.map((m) => m.code) })
  }
  const withoutDetails = preset.modules.filter((m) => m.details === undefined)
  if (withoutDetails.length > 0) {
    warnings.push({ kind: 'modules_without_details', codes: withoutDetails.map((m) => m.code) })
  }
  return warnings
}

/** A follow-up message for the LLM listing what to fix. English, like the prompt. */
export function describeIssuesForLlm(result: CustomPresetFailure): string {
  const intro = {
    empty: 'Your answer was empty.',
    no_json: 'Your answer contains no JSON object. The planner needs the extracted data as JSON.',
    invalid_json: 'Your answer contains JSON that cannot be parsed.',
    invalid_preset: 'Your JSON does not match the required schema.',
  }[result.reason]
  const lines = result.issues.map((issue) => `- ${issue.path || '(document)'}: ${issue.message}`)
  return [
    intro,
    ...(lines.length > 0 ? ['', 'Problems:', ...lines] : []),
    '',
    'Fix these problems using the attached documents and reply with the complete corrected JSON object in a single ```json code block, nothing else.',
  ].join('\n')
}
