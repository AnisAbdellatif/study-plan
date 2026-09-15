/** Paper orientations of the print page. The value is the `?orientation=` search param. */
export const PRINT_ORIENTATIONS = ['portrait', 'landscape'] as const
export type PrintOrientation = (typeof PRINT_ORIENTATIONS)[number]

/** Portrait is the default and stays out of the URL; anything unknown falls back to it. */
export const validatePrintSearch = (search: Record<string, unknown>): { orientation?: 'landscape' } =>
  search.orientation === 'landscape' ? { orientation: 'landscape' } : {}
