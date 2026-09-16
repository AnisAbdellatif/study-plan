import { describe, expect, it } from 'vitest'
import { tidyCatalogText, tidyModuleDetails } from './text.ts'

describe('catalog texts', () => {
  it('joins the lines a PDF broke inside a sentence', () => {
    const text =
      'Die Studierenden kennen die grundlegenden\nmathematischen Konzepte zur Behandlung\nzeitdiskreter Signale.'
    expect(tidyCatalogText(text)).toBe(
      'Die Studierenden kennen die grundlegenden mathematischen Konzepte zur Behandlung zeitdiskreter Signale.',
    )
  })

  it('keeps paragraphs and list items', () => {
    const text =
      'Nach dem Modul können die Studierenden:\n- Programme entwerfen\n- Programme testen\n\nDas Modul ist\nzweisemestrig.'
    expect(tidyCatalogText(text)).toBe(
      'Nach dem Modul können die Studierenden:\n- Programme entwerfen\n- Programme testen\n\nDas Modul ist zweisemestrig.',
    )
  })

  it('drops blank lines at the edges and doubled ones in between', () => {
    expect(tidyCatalogText('\n\n  Inhalt  \n\n\n\nZweiter Absatz\n\n')).toBe('Inhalt\n\nZweiter Absatz')
    expect(tidyCatalogText('Windows-Zeilen\r\nwerden auch verbunden.')).toBe(
      'Windows-Zeilen werden auch verbunden.',
    )
  })

  it('tidies every text of a module entry and leaves the rest alone', () => {
    const details = tidyModuleDetails({
      englishName: 'Digital Signal Processing',
      content: 'Beschreibung\nzeitdiskreter Systeme',
      literature: ['Oppenheim, Schafer:\nZeitdiskrete Signalverarbeitung'],
      examForms: ['Klausur (K)'],
      additionalFields: [{ label: 'Zuständigkeit', value: 'ET-\nIT' }],
      sws: 4,
    })
    expect(details.content).toBe('Beschreibung zeitdiskreter Systeme')
    expect(details.literature).toEqual(['Oppenheim, Schafer: Zeitdiskrete Signalverarbeitung'])
    expect(details.additionalFields).toEqual([{ label: 'Zuständigkeit', value: 'ET- IT' }])
    expect(details.englishName).toBe('Digital Signal Processing')
    expect(details.sws).toBe(4)
    expect(details.remarks).toBeUndefined()
  })
})
