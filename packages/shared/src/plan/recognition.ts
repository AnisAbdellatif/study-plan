import { findModule, PlanError } from './operations.ts'
import { type Plan, type Recognition, recognitionSchema } from './plan.ts'

/** What the recognition form sends: empty text fields mean "not given". */
export interface RecognitionInput {
  status: Recognition['status']
  institution?: string
  originalTitle?: string
  originalCredits?: number
  note?: string
}

/** Sets or clears a module's recognition (Anerkennung). Its result stays in the attempts. */
export function setRecognition(plan: Plan, code: string, input: RecognitionInput | null): Plan {
  findModule(plan, code)
  let recognition: Recognition | undefined
  if (input) {
    const text = (value: string | undefined) => (value?.trim() ? value.trim() : undefined)
    const parsed = recognitionSchema.safeParse({
      status: input.status,
      institution: text(input.institution),
      originalTitle: text(input.originalTitle),
      originalCredits: input.originalCredits,
      note: text(input.note),
    })
    if (!parsed.success) throw new PlanError(`Invalid recognition for "${code}"`)
    recognition = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Recognition
  }
  return {
    ...plan,
    modules: plan.modules.map((module) => {
      if (module.code !== code) return module
      const { recognition: _previous, ...rest } = module
      return recognition ? { ...rest, recognition } : rest
    }),
  }
}
