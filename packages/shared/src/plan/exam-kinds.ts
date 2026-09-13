/** Broad kinds of assessment, derived from the verbatim exam forms of the Modulkatalog. */
export const EXAM_KINDS = [
  'written',
  'oral',
  'project',
  'presentation',
  'paper',
  'practical',
  'portfolio',
] as const
export type ExamKind = (typeof EXAM_KINDS)[number]

// Checked per form; a form like "Klausur oder mündliche Prüfung" yields several kinds. German and English terms,
// because exam forms stay in the language of the catalog.
const PATTERNS: Record<ExamKind, RegExp> = {
  // Only explicit written terms: a bare "exam" also appears in "oral examination".
  written: /klausur|schriftliche\s+prüfung|written\s+(exam|test)|\bwritten\b/i,
  oral: /mündlich|muendlich|\boral\b|kolloquium|colloquium/i,
  project: /projekt|project/i,
  presentation: /referat|vortrag|präsentation|presentation|\btalk\b/i,
  paper:
    /hausarbeit|seminararbeit|studienarbeit|ausarbeitung|\bbericht|protokoll|essay|\breport\b|\bpaper\b|bachelorarbeit|masterarbeit|abschlussarbeit|thesis/i,
  practical: /labor|laboratory|\blab\b|praktische\s+prüfung|practical|experiment|programmieraufgabe/i,
  portfolio: /portfolio/i,
}

/**
 * The kinds of assessment named in a module's exam forms, in the order of `EXAM_KINDS`. Empty when the forms are
 * missing or name nothing recognisable; callers then show nothing rather than guess.
 */
export function examKinds(forms: readonly string[] | undefined): ExamKind[] {
  if (!forms?.length) return []
  const found = new Set<ExamKind>()
  for (const form of forms) {
    for (const kind of EXAM_KINDS) {
      // "Projektarbeit" is a project, not also a paper.
      if (kind === 'paper' && /projektarbeit|project\s+report/i.test(form)) continue
      if (PATTERNS[kind].test(form)) found.add(kind)
    }
  }
  return EXAM_KINDS.filter((kind) => found.has(kind))
}
