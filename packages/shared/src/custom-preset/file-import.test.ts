import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCustomPreset } from './response.ts'

const example = JSON.parse(
  readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

describe('parseCustomPreset without student input', () => {
  it('takes university, programme, degree and PO version from the file and still generates the id', () => {
    const result = parseCustomPreset(JSON.stringify(example), null, 'abc123')
    if (!result.success) throw new Error(JSON.stringify(result.issues))
    expect(result.preset.university).toEqual({ slug: 'beispiel-universitaet', name: 'Beispiel-Universität' })
    expect(result.preset.programme).toEqual({ slug: 'informatik-bsc', name: 'Informatik', degree: 'bsc' })
    expect(result.preset.poVersion).toBe('PO 2024 (fiktiv)')
    expect(result.preset.id).toBe('custom/informatik-bsc-abc123')
  })

  it('reports missing names at their place in the file', () => {
    const { university: _university, programme: _programme, ...withoutNames } = example
    const result = parseCustomPreset(JSON.stringify(withoutNames), null, 'abc123')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.reason).toBe('invalid_preset')
    const paths = result.issues.map((issue) => issue.path)
    expect(paths).toEqual(expect.arrayContaining(['university.name', 'programme.name', 'programme.degree']))
  })

  it('still prefers the student input when there is one', () => {
    const result = parseCustomPreset(
      JSON.stringify(example),
      { universityName: 'Uni Musterstadt', programmeName: 'Medieninformatik', degree: 'msc' },
      'abc123',
    )
    if (!result.success) throw new Error(JSON.stringify(result.issues))
    expect(result.preset.university.name).toBe('Uni Musterstadt')
    expect(result.preset.programme).toMatchObject({ name: 'Medieninformatik', degree: 'msc' })
  })
})
