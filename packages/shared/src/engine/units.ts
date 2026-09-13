/**
 * Boundary conversion from JSON numbers to integer units.
 *
 * Presets and user input carry grades like 1.3 and credits like 7.5 as JSON numbers.
 * They are converted exactly once, here, into integer tenths and halves. Anything that is
 * not an exact multiple is rejected instead of being silently rounded.
 */
const EPSILON = 1e-9

export const isMultipleOf = (value: number, unitsPerOne: number): boolean =>
  Number.isFinite(value) && Math.abs(value * unitsPerOne - Math.round(value * unitsPerOne)) <= EPSILON

export function toUnits(value: number, unitsPerOne: number, label: string): number {
  if (!isMultipleOf(value, unitsPerOne)) {
    throw new RangeError(`${label} ${value} is not a multiple of 1/${unitsPerOne}`)
  }
  return Math.round(value * unitsPerOne)
}

/** 1.3 -> 13 */
export const gradeToTenths = (grade: number): number => toUnits(grade, 10, 'Grade')

/** 7.5 -> 15. Also used for weight factors (0.5 -> 1). */
export const toHalves = (value: number): number => toUnits(value, 2, 'Value')
