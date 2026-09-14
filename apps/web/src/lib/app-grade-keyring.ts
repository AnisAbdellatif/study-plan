import { browserKeyStore, GradeKeyring } from './grade-keys.ts'

/**
 * The grade keys of this browser. Tests derive with few iterations so they stay fast; the algorithm is the same.
 */
export const appGradeKeyring = new GradeKeyring(
  browserKeyStore(),
  import.meta.env.MODE === 'test' ? { iterations: 1000 } : {},
)
