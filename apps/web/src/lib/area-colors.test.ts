import { describe, expect, it } from 'vitest'
import { areaTone, moduleTone, NEUTRAL_TONE, toneAt } from './area-colors.ts'

const plan = {
  areas: [
    { id: 'a', name: 'A', minCredits: 10, moduleCodes: ['M1', 'M2'] },
    { id: 'b', name: 'B', minCredits: 10, moduleCodes: ['M3', 'M2'] },
  ],
}

describe('area colours', () => {
  it('gives each area its own tone and repeats after eight', () => {
    expect(areaTone(plan, 'a')).not.toEqual(areaTone(plan, 'b'))
    expect(toneAt(8)).toEqual(toneAt(0))
  })

  it('colours a module by the first area that lists it, and others neutrally', () => {
    expect(moduleTone(plan, 'M2')).toEqual(areaTone(plan, 'a'))
    expect(moduleTone(plan, 'M3')).toEqual(areaTone(plan, 'b'))
    expect(moduleTone(plan, 'custom-1')).toBe(NEUTRAL_TONE)
    expect(areaTone(plan, 'unknown')).toBe(NEUTRAL_TONE)
  })
})
