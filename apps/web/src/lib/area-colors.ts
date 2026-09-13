import type { Plan } from '@study-plan/shared'

/**
 * One colour per area (Bereich), shared by the board and the study plan overview so a module looks the same in
 * both. Class names are written out in full so Tailwind finds them. Indigo stays reserved for actions and focus.
 */
export interface AreaTone {
  /** Left accent border of a card. */
  stripe: string
  /** Light tint for cards. */
  soft: string
  /** Stronger tint for blocks in the overview; readable with the default text colour. */
  strong: string
  /** Small swatch in legends. */
  dot: string
  /** Coloured text, e.g. an area label. */
  text: string
}

const TONES: readonly AreaTone[] = [
  {
    stripe: 'border-l-sky-500 dark:border-l-sky-400',
    soft: 'bg-sky-100 dark:bg-sky-950/70',
    strong: 'bg-sky-100 dark:bg-sky-900/50',
    dot: 'bg-sky-500 dark:bg-sky-400',
    text: 'text-sky-800 dark:text-sky-300',
  },
  {
    stripe: 'border-l-emerald-500 dark:border-l-emerald-400',
    soft: 'bg-emerald-100 dark:bg-emerald-950/70',
    strong: 'bg-emerald-100 dark:bg-emerald-900/50',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    stripe: 'border-l-amber-500 dark:border-l-amber-400',
    soft: 'bg-amber-100 dark:bg-amber-950/70',
    strong: 'bg-amber-100 dark:bg-amber-900/50',
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-800 dark:text-amber-300',
  },
  {
    stripe: 'border-l-violet-500 dark:border-l-violet-400',
    soft: 'bg-violet-100 dark:bg-violet-950/70',
    strong: 'bg-violet-100 dark:bg-violet-900/50',
    dot: 'bg-violet-500 dark:bg-violet-400',
    text: 'text-violet-800 dark:text-violet-300',
  },
  {
    stripe: 'border-l-rose-500 dark:border-l-rose-400',
    soft: 'bg-rose-100 dark:bg-rose-950/70',
    strong: 'bg-rose-100 dark:bg-rose-900/50',
    dot: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-800 dark:text-rose-300',
  },
  {
    stripe: 'border-l-teal-500 dark:border-l-teal-400',
    soft: 'bg-teal-100 dark:bg-teal-950/70',
    strong: 'bg-teal-100 dark:bg-teal-900/50',
    dot: 'bg-teal-500 dark:bg-teal-400',
    text: 'text-teal-800 dark:text-teal-300',
  },
  {
    stripe: 'border-l-lime-600 dark:border-l-lime-400',
    soft: 'bg-lime-100 dark:bg-lime-950/70',
    strong: 'bg-lime-100 dark:bg-lime-900/50',
    dot: 'bg-lime-600 dark:bg-lime-400',
    text: 'text-lime-800 dark:text-lime-300',
  },
  {
    stripe: 'border-l-fuchsia-500 dark:border-l-fuchsia-400',
    soft: 'bg-fuchsia-100 dark:bg-fuchsia-950/70',
    strong: 'bg-fuchsia-100 dark:bg-fuchsia-900/50',
    dot: 'bg-fuchsia-500 dark:bg-fuchsia-400',
    text: 'text-fuchsia-800 dark:text-fuchsia-300',
  },
]

/** For modules outside every area, e.g. custom modules without an area. */
export const NEUTRAL_TONE: AreaTone = {
  stripe: 'border-l-zinc-400 dark:border-l-zinc-500',
  soft: 'bg-white dark:bg-zinc-900',
  strong: 'bg-zinc-100 dark:bg-zinc-800',
  dot: 'bg-zinc-400 dark:bg-zinc-500',
  text: 'text-zinc-700 dark:text-zinc-300',
}

/** The tone of the area at this position in plan.areas; colours repeat after eight areas. */
export const toneAt = (index: number): AreaTone =>
  index < 0 ? NEUTRAL_TONE : (TONES[index % TONES.length] ?? NEUTRAL_TONE)

export function areaTone(plan: Pick<Plan, 'areas'>, areaId: string): AreaTone {
  return toneAt(plan.areas.findIndex((area) => area.id === areaId))
}

// Plans are immutable, so a lookup built once per areas array stays valid; every card then is one Map read.
const moduleAreaIndexCache = new WeakMap<Plan['areas'], Map<string, number>>()

function moduleAreaIndex(areas: Plan['areas']): Map<string, number> {
  let index = moduleAreaIndexCache.get(areas)
  if (!index) {
    const built = new Map<string, number>()
    areas.forEach((area, position) => {
      for (const code of area.moduleCodes) if (!built.has(code)) built.set(code, position)
    })
    moduleAreaIndexCache.set(areas, built)
    index = built
  }
  return index
}

/** The tone of the first area that lists the module, or the neutral tone. */
export function moduleTone(plan: Pick<Plan, 'areas'>, moduleCode: string): AreaTone {
  return toneAt(moduleAreaIndex(plan.areas).get(moduleCode) ?? -1)
}
