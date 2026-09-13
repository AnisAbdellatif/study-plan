import { describe, expect, it } from 'vitest'
import { examKinds } from './exam-kinds.ts'

describe('examKinds', () => {
  it('recognises the usual German exam forms', () => {
    expect(examKinds(['Klausur (90 Min.)'])).toEqual(['written'])
    expect(examKinds(['mündliche Prüfung (30 Min.)'])).toEqual(['oral'])
    expect(examKinds(['Klausur (120 Min.) oder mündliche Prüfung'])).toEqual(['written', 'oral'])
    expect(examKinds(['Projektarbeit mit Abschlusspräsentation'])).toEqual(['project', 'presentation'])
    expect(examKinds(['Hausarbeit und Referat'])).toEqual(['presentation', 'paper'])
    expect(examKinds(['Laborleistung'])).toEqual(['practical'])
    expect(examKinds(['Portfolio'])).toEqual(['portfolio'])
    expect(examKinds(['Bachelorarbeit', 'Kolloquium'])).toEqual(['oral', 'paper'])
  })

  it('recognises English exam forms', () => {
    expect(examKinds(['Written exam (90 min)'])).toEqual(['written'])
    expect(examKinds(['Oral examination'])).toEqual(['oral'])
    expect(examKinds(['Project report and talk'])).toEqual(['project', 'presentation'])
  })

  it('returns nothing for missing or unrecognisable forms', () => {
    expect(examKinds(undefined)).toEqual([])
    expect(examKinds([])).toEqual([])
    expect(examKinds(['siehe Aushang'])).toEqual([])
  })
})
