/** Ways to add a programme on the start page, in tab order. The value is the `?method=` search param. */
export const START_METHODS = ['template', 'file', 'llm'] as const
export type StartMethod = (typeof START_METHODS)[number]

export const isStartMethod = (value: unknown): value is StartMethod =>
  START_METHODS.includes(value as StartMethod)

/** Unknown values are dropped; without a method the page picks one itself. */
export const validateStartSearch = (search: Record<string, unknown>): { method?: StartMethod } =>
  isStartMethod(search.method) ? { method: search.method } : {}
