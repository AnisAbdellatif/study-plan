/** Thrown when input data violates the grade rules, e.g. a grade that is not an allowed value. */
export class GradeRuleError extends Error {
  override readonly name = 'GradeRuleError'
}
