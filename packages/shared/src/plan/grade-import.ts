import type { AttemptEntry } from './attempts.ts'
import type { ResultEntry } from './operations.ts'
import type { Plan, PlanModule } from './plan.ts'

/**
 * - matched: one module and a result that fits it
 * - ambiguous: a result, and several modules could be meant
 * - unmatched: a result, but no module fits
 * - invalid: a module fits, but the result does not (e.g. a grade that is not allowed, or "bestanden" for a graded module)
 * - no_result: no grade or pass/fail marker, e.g. a table header; ignored
 */
export type ImportRowStatus = 'matched' | 'ambiguous' | 'unmatched' | 'invalid' | 'no_result'

export interface ImportRow {
  line: number
  text: string
  status: ImportRowStatus
  result: ResultEntry | null
  moduleCode: string | null
  /** Module codes that could be meant, best first. Set for ambiguous rows. */
  candidates: string[]
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const tokensOf = (value: string): Set<string> => new Set(normalize(value).split(' ').filter(Boolean))

/** A grade like 1,3 or 2.0 that is not part of a longer number, a date, or a credit value like "8,0 LP". */
const GRADE = /(?<![\d.,])([1-5])[.,](\d)(?![\d.,])(?!\s*(?:lp|ects|cp|kp|credits?)\b)/gi
// Checked before PASSED, so "not passed" and "did not pass" count as failed.
const FAILED = /\b(nicht\s+bestanden|nb|not\s+passed|did\s+not\s+pass|failed|fail)\b/i
const PASSED = /\b(bestanden|be|bst|passed|pass)\b/i

type RawResult = { kind: 'grade'; grade: number } | { kind: 'passed' } | { kind: 'failed' }

function readResult(text: string): RawResult | null {
  const grade = [...text.matchAll(GRADE)][0]
  if (grade) return { kind: 'grade', grade: Number(`${grade[1]}.${grade[2]}`) }
  if (FAILED.test(text)) return { kind: 'failed' }
  if (PASSED.test(text)) return { kind: 'passed' }
  return null
}

function fitResult(raw: RawResult, module: PlanModule, plan: Plan): ResultEntry | null {
  const { passThreshold, allowedValues } = plan.rules
  if (module.grading === 'pass_fail') {
    if (raw.kind === 'grade') return { kind: raw.grade <= passThreshold ? 'passed' : 'failed' }
    return { kind: raw.kind }
  }
  if (raw.kind !== 'grade') return raw.kind === 'failed' ? { kind: 'graded', grade: 5 } : null
  return allowedValues.includes(raw.grade) ? { kind: 'graded', grade: raw.grade } : null
}

interface ModuleMatch {
  code: string
  score: number
  size: number
}

/** How much of each module's name (or its code) appears in the line. */
function rankModules(text: string, plan: Plan): ModuleMatch[] {
  const lineTokens = tokensOf(text)
  const normalizedLine = ` ${normalize(text)} `
  return plan.modules
    .map((module) => {
      if (normalizedLine.includes(` ${normalize(module.code)} `))
        return { code: module.code, score: 1, size: 99 }
      const nameTokens = [...tokensOf(module.name)]
      const found = nameTokens.filter((token) => lineTokens.has(token)).length
      return {
        code: module.code,
        score: nameTokens.length === 0 ? 0 : found / nameTokens.length,
        size: nameTokens.length,
      }
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || b.size - a.size)
}

const PARTIAL_MATCH = 0.75

/** Reads pasted text or CSV, one exam per line, and matches each line to a module of the plan. */
export function parseGradeImport(text: string, plan: Plan): ImportRow[] {
  const modules = new Map(plan.modules.map((module) => [module.code, module]))
  return text.split(/\r?\n/).flatMap((raw, index): ImportRow[] => {
    const line = raw.trim()
    if (line === '') return []
    const base = { line: index + 1, text: line }
    const rawResult = readResult(line)
    if (!rawResult) return [{ ...base, status: 'no_result', result: null, moduleCode: null, candidates: [] }]

    const ranked = rankModules(line, plan)
    const full = ranked.filter((match) => match.score === 1)
    // Among complete matches the longest name wins ("Mathematik II" over "Mathematik"), unless it is a tie.
    const [first, second] = full
    const chosen = first && (!second || first.size > second.size) ? first : undefined

    if (!chosen) {
      const candidates = (
        full.length > 0 ? full : ranked.filter((match) => match.score >= PARTIAL_MATCH)
      ).map((m) => m.code)
      return [
        {
          ...base,
          status: candidates.length > 0 ? 'ambiguous' : 'unmatched',
          result:
            rawResult.kind === 'grade'
              ? { kind: 'graded', grade: rawResult.grade }
              : { kind: rawResult.kind },
          moduleCode: null,
          candidates,
        },
      ]
    }

    const module = modules.get(chosen.code)
    const result = module ? fitResult(rawResult, module, plan) : null
    return [
      {
        ...base,
        status: result ? 'matched' : 'invalid',
        result:
          result ??
          (rawResult.kind === 'grade'
            ? { kind: 'graded', grade: rawResult.grade }
            : { kind: rawResult.kind }),
        moduleCode: chosen.code,
        candidates: [],
      },
    ]
  })
}

/** Adapts a result to a module the student picked by hand, or null when it cannot fit. */
export function fitImportResult(result: ResultEntry, module: PlanModule, plan: Plan): ResultEntry | null {
  if (result.kind === 'open') return null
  const raw: RawResult =
    result.kind === 'graded' ? { kind: 'grade', grade: result.grade } : { kind: result.kind }
  return fitResult(raw, module, plan)
}

const rank = (entry: ResultEntry, passThreshold: number): number => {
  switch (entry.kind) {
    case 'graded':
      return entry.grade <= passThreshold ? 100 - entry.grade * 10 : 10
    case 'passed':
      return 50
    case 'failed':
      return 5
    case 'open':
      return 0
  }
}

/**
 * Several lines for the same module are attempts, e.g. a failed exam and a later pass.
 * The best one wins: a passing grade over a pass, a pass over a fail, a better grade over a worse one.
 */
export function mergeImportResults(
  assignments: readonly { moduleCode: string; result: ResultEntry }[],
  plan: Plan,
): Map<string, ResultEntry> {
  const merged = new Map<string, ResultEntry>()
  for (const { moduleCode, result } of assignments) {
    const current = merged.get(moduleCode)
    if (!current || rank(result, plan.rules.passThreshold) > rank(current, plan.rules.passThreshold)) {
      merged.set(moduleCode, result)
    }
  }
  return merged
}

const passes = (entry: ResultEntry, passThreshold: number): boolean =>
  entry.kind === 'passed' || (entry.kind === 'graded' && entry.grade <= passThreshold)

/**
 * Rebuilds each module's attempt history from the import: results that did not pass in the order they appear,
 * then the best passing result.
 */
export function mergeImportAttempts(
  assignments: readonly { moduleCode: string; result: ResultEntry }[],
  plan: Plan,
): Map<string, AttemptEntry[]> {
  const threshold = plan.rules.passThreshold
  const attempts = new Map<string, AttemptEntry[]>()
  for (const { moduleCode, result } of assignments) {
    if (result.kind === 'open') continue
    const list = attempts.get(moduleCode) ?? []
    if (!passes(result, threshold)) list.push(result)
    attempts.set(moduleCode, list)
  }
  for (const [code, best] of mergeImportResults(assignments, plan)) {
    if (best.kind !== 'open' && passes(best, threshold)) attempts.get(code)?.push(best)
  }
  return attempts
}
