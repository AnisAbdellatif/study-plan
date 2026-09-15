/** Tabs of the admin dashboard, in display order. The value is the `?tab=` search param. */
export const ADMIN_TABS = ['overview', 'accounts', 'presets', 'assistant', 'settings', 'log'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export const isAdminTab = (value: unknown): value is AdminTab => ADMIN_TABS.includes(value as AdminTab)

/** Unknown or missing values open the overview; leaving it out keeps plain /admin links short. */
export const validateAdminSearch = (search: Record<string, unknown>): { tab?: AdminTab } =>
  isAdminTab(search.tab) && search.tab !== 'overview' ? { tab: search.tab } : {}
