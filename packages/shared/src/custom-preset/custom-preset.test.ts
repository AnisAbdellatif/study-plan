import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { buildExtractionPrompt } from './prompt.ts'
import { describeIssuesForLlm, extractJson, parseCustomPreset, slugify } from './response.ts'

const input = {
  universityName: 'Technische Universität Musterstadt',
  programmeName: 'Wirtschaftsinformatik',
  degree: 'msc',
  poVersion: 'PO 2025',
} as const

const example = JSON.parse(
  readFileSync(new URL('../../../../presets/example/informatik-bsc-example.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

const withDetails = {
  ...example,
  modules: (example.modules as Record<string, unknown>[]).map((module, index) =>
    index === 0
      ? {
          ...module,
          details: {
            englishName: 'Programming Basics',
            responsible: ['Prof. Dr. Ada Lovelace'],
            languages: ['deutsch'],
            sws: 4,
            courses: [
              { type: 'Vorlesung', sws: 2 },
              { type: 'Übung', sws: 2 },
            ],
            workload: { totalHours: 240 },
            examForms: ['Klausur (90 Min.)'],
            literature: ['Knuth: The Art of Computer Programming'],
            additionalFields: [{ label: 'Prüfungsnummer', value: '1234' }],
          },
        }
      : module,
  ),
}

describe('extraction prompt', () => {
  const prompt = buildExtractionPrompt(input)

  it('names the programme and asks for one JSON object validated by the real schema', () => {
    expect(prompt).toContain('- University: Technische Universität Musterstadt')
    expect(prompt).toContain('- Degree: Master of Science (M.Sc.)')
    expect(prompt).toContain('- Examination regulations version: PO 2025')
    expect(prompt).toContain('exactly one JSON object in a single ```json code block')
    const schemaBlock = prompt.slice(
      prompt.lastIndexOf('```json') + '```json'.length,
      prompt.lastIndexOf('```'),
    )
    const schema = JSON.parse(schemaBlock) as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['gradeRules', 'modules', 'examRules']),
    )
  })

  it('covers every planner feature and every module detail field', () => {
    for (const term of [
      'withdrawalDaysBeforeExam',
      'maxAttempts',
      'retakePassedExams',
      'supplementaryExamOnLastAttempt',
      'typicalSemester',
      'prerequisites',
      'anyOf',
      'requiresCredits',
      'codesAreOfficial',
      'allowedValues',
      'standardGrades',
      'finalRounding',
      'dropWorst',
      'keepBest',
      'roundResult',
      'factor',
      'areas',
    ]) {
      expect(prompt, term).toContain(term)
    }
    const detailFields = Object.keys(presetSchema.shape.modules.element.shape.details.unwrap().shape)
    for (const field of detailFields) expect(prompt, field).toContain(`\`${field}\``)
  })

  it('contains an example that is itself a valid preset', () => {
    const exampleBlock = prompt.slice(prompt.indexOf('# Example'), prompt.indexOf('# JSON Schema'))
    const json = extractJson(exampleBlock)
    expect(json).not.toBeNull()
    expect(presetSchema.safeParse(JSON.parse(json ?? '')).success).toBe(true)
  })
})

describe('LLM answer', () => {
  it('finds the JSON in a fenced answer with chatter around it and applies the student input', () => {
    const answer = `Here is the result:\n\n\`\`\`json\n${JSON.stringify({ ...withDetails, transitions: [] })}\n\`\`\`\nLet me know!`
    const result = parseCustomPreset(answer, input, 'AB12')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.preset.id).toBe('custom/wirtschaftsinformatik-msc-ab12')
    expect(result.preset.university).toEqual({
      slug: 'technische-universitaet-musterstadt',
      name: 'Technische Universität Musterstadt',
    })
    expect(result.preset.programme).toEqual({
      slug: 'wirtschaftsinformatik-msc',
      name: 'Wirtschaftsinformatik',
      degree: 'msc',
    })
    expect(result.preset.poVersion).toBe('PO 2025')
    expect(result.preset.transitions).toBeUndefined()
    expect(result.preset.modules[0]?.details?.courses).toHaveLength(2)
    expect(result.warnings).toContainEqual({
      kind: 'modules_without_details',
      codes: expect.arrayContaining(['INF-102']),
    })
  })

  it('accepts bare JSON and keeps the LLM PO version when the student gave none', () => {
    const result = parseCustomPreset(JSON.stringify(example), { ...input, poVersion: '' }, 'x')
    expect(result.success && result.preset.poVersion).toBe('PO 2024 (fiktiv)')
  })

  it('explains empty input, missing JSON and broken JSON', () => {
    expect(parseCustomPreset('  ', input, 'x')).toMatchObject({ success: false, reason: 'empty' })
    expect(parseCustomPreset('Sorry, I cannot read the PDF.', input, 'x')).toMatchObject({
      success: false,
      reason: 'no_json',
    })
    const broken = parseCustomPreset('```json\n{"modules": [1,]}\n```', input, 'x')
    expect(broken).toMatchObject({ success: false, reason: 'invalid_json' })
  })

  it('lists schema problems with paths and turns them into a follow-up for the LLM', () => {
    const modules = structuredClone(example.modules) as Record<string, unknown>[]
    modules[1] = { ...modules[1], credits: 'acht' }
    const result = parseCustomPreset(JSON.stringify({ ...example, modules }), input, 'x')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toBe('invalid_preset')
    expect(result.issues.map((issue) => issue.path)).toContain('modules[1].credits')
    const followUp = describeIssuesForLlm(result)
    expect(followUp).toContain('- modules[1].credits:')
    expect(followUp).toContain('complete corrected JSON object')
  })

  it('slugifies German names', () => {
    expect(slugify('Leibniz Universität Hannover', 'u')).toBe('leibniz-universitaet-hannover')
    expect(slugify('!!!', 'fallback')).toBe('fallback')
  })
})
