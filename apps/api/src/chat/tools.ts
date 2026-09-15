import { EXAM_KINDS, examKinds } from '@study-plan/shared'
import { z } from 'zod'
import type { LlmToolDefinition } from '../llm/types.ts'
import type { ChatModule, ChatProgramme } from './programme.ts'

const MAX_RESULT_CHARS = 24_000
const MAX_SEARCH_RESULTS = 30

const searchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  areaId: z.string().max(100).optional(),
  /** "winter" and "summer" include modules offered every semester. */
  offeredIn: z.enum(['winter', 'summer']).optional(),
  examKind: z.enum(EXAM_KINDS).optional(),
  grading: z.enum(['graded', 'pass_fail']).optional(),
  electiveOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
})
const getModuleSchema = z.object({ code: z.string().min(1).max(100) })

export const CHAT_TOOLS: LlmToolDefinition[] = [
  {
    name: 'search_modules',
    description:
      'Find modules of the programme. All filters are optional and combine. Returns short summaries; use get_module for the full catalogue entry of one module.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Words to look for in the module name, code, area, content and learning outcomes.',
        },
        areaId: { type: 'string', description: 'Only modules of this area (see get_programme_overview).' },
        offeredIn: {
          type: 'string',
          enum: ['winter', 'summer'],
          description:
            'Only modules that can be taken in this semester (includes modules offered every semester).',
        },
        examKind: {
          type: 'string',
          enum: [...EXAM_KINDS],
          description: 'Only modules with this kind of exam.',
        },
        grading: { type: 'string', enum: ['graded', 'pass_fail'] },
        electiveOnly: {
          type: 'boolean',
          description: 'Only modules the student chooses among alternatives.',
        },
        limit: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_RESULTS },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_module',
    description:
      'The full catalogue entry of one module: credits, offering, prerequisites, exam forms, content, learning outcomes, workload and more.',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The module code from search_modules.' } },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_programme_overview',
    description:
      'The programme itself: university, degree, examination regulations version, standard duration, total credits, exam rules, areas with their credit requirements, groups of areas a student picks one of (e.g. one Nebenfach, whose compulsory modules only apply once picked), and how the final grade is calculated.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
]

const summary = (programme: ChatProgramme, module: ChatModule) => ({
  code: module.code,
  name: module.name,
  credits: module.credits,
  area: module.category,
  areaIds: programme.areas.filter((area) => area.moduleCodes.includes(module.code)).map((area) => area.id),
  offering: module.offering,
  examKinds: examKinds(module.details?.examForms),
  grading: module.grading,
  ...(module.typicalSemester !== undefined ? { recommendedSemester: module.typicalSemester } : {}),
  ...(module.elective ? { elective: true } : {}),
})

const matches = (module: ChatModule, query: string) => {
  const needle = query.toLowerCase()
  return [
    module.code,
    module.name,
    module.category,
    module.details?.englishName,
    module.details?.content,
    module.details?.learningOutcomes,
  ].some((text) => text?.toLowerCase().includes(needle))
}

export interface ToolResult {
  /** JSON text for the model. */
  content: string
  /** Modules this call looked at in detail, to show as references next to the answer. */
  moduleCodes: string[]
}

const result = (value: unknown, moduleCodes: string[] = []): ToolResult => {
  const text = JSON.stringify(value)
  return {
    content: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)` : text,
    moduleCodes,
  }
}

/** Runs one tool call against the programme. Invalid calls return an error the model can correct. */
export function executeTool(programme: ChatProgramme, name: string, rawArguments: string): ToolResult {
  let args: unknown
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {}
  } catch {
    return result({ error: 'Arguments are not valid JSON.' })
  }

  switch (name) {
    case 'search_modules': {
      const parsed = searchSchema.safeParse(args)
      if (!parsed.success) return result({ error: 'Invalid arguments.', issues: parsed.error.issues })
      const { query, areaId, offeredIn, examKind, grading, electiveOnly, limit } = parsed.data
      const area = areaId ? programme.areas.find((item) => item.id === areaId) : undefined
      if (areaId && !area) return result({ error: `Unknown area "${areaId}".` })
      const found = programme.modules.filter(
        (module) =>
          (!query || matches(module, query)) &&
          (!area || area.moduleCodes.includes(module.code)) &&
          (!offeredIn || module.offering === offeredIn || module.offering === 'both') &&
          (!examKind || examKinds(module.details?.examForms).includes(examKind)) &&
          (!grading || module.grading === grading) &&
          (!electiveOnly || module.elective === true),
      )
      const shown = found.slice(0, limit ?? 20)
      return result({ total: found.length, modules: shown.map((module) => summary(programme, module)) })
    }
    case 'get_module': {
      const parsed = getModuleSchema.safeParse(args)
      if (!parsed.success) return result({ error: 'Invalid arguments.', issues: parsed.error.issues })
      const module = programme.modules.find((item) => item.code === parsed.data.code)
      if (!module) return result({ error: `Unknown module "${parsed.data.code}". Use search_modules.` })
      return result(
        { ...module, ...summary(programme, module), examKinds: examKinds(module.details?.examForms) },
        [module.code],
      )
    }
    case 'get_programme_overview': {
      const { modules, ...rest } = programme
      return result({
        ...rest,
        moduleCount: modules.length,
        areas: programme.areas.map(({ moduleCodes, ...area }) => ({
          ...area,
          moduleCount: moduleCodes.length,
        })),
      })
    }
    default:
      return result({ error: `Unknown tool "${name}".` })
  }
}
