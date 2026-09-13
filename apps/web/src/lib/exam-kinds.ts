import { examKinds, type PlanModule } from '@study-plan/shared'
import i18n from '../i18n/index.ts'

/** Short labels of the module's kinds of assessment, e.g. ["Klausur", "Mündlich"]; empty when unknown. */
export const examKindLabels = (module: PlanModule): string[] =>
  examKinds(module.details?.examForms).map((kind) => i18n.t(`board:examKinds.${kind}`))
