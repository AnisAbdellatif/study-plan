import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import type { AdminChatUsage, ChatUsageTotals } from '../lib/api.ts'
import { ChatUsageSection } from './admin-chat-usage.tsx'

const totals = (overrides: Partial<ChatUsageTotals> = {}): ChatUsageTotals => ({
  questions: 0,
  failed: 0,
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  cost: 0,
  ...overrides,
})

const used = totals({
  questions: 12,
  failed: 1,
  calls: 31,
  promptTokens: 48000,
  completionTokens: 3200,
  cost: 0.0123,
})

const usage: AdminChatUsage = {
  days: Array.from({ length: 30 }, (_, index) => ({
    day: `2026-09-${String(index + 1).padStart(2, '0')}`,
    ...(index === 29 ? used : totals()),
  })),
  models: [{ model: 'google/gemma-4-31b-it', ...used }],
  totals: { today: used, last7Days: used, last30Days: used },
  credits: {
    used: 4.5,
    usedToday: 0.01,
    usedThisWeek: 0.2,
    usedThisMonth: 1.25,
    limit: null,
    remaining: null,
  },
  creditsStatus: 'ok',
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('assistant usage on the admin dashboard', () => {
  it('shows questions, tokens and cost per period, per model and the key’s spending', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(usage), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    render(<ChatUsageSection />)

    const week = (await screen.findByText('Letzte 7 Tage')).parentElement as HTMLElement
    expect(within(week).getByText('12 Fragen · 1 fehlgeschlagen')).toBeInTheDocument()
    expect(within(week).getByText('48.000 Eingabe- · 3.200 Ausgabe-Tokens')).toBeInTheDocument()

    expect(screen.getByRole('img', { name: /insgesamt 51\.200/ })).toBeInTheDocument()
    const row = screen.getByRole('cell', { name: 'google/gemma-4-31b-it' }).closest('tr') as HTMLElement
    expect(within(row).getByText('31')).toBeInTheDocument()

    expect(screen.getByText('Insgesamt ausgegeben')).toBeInTheDocument()
    expect(screen.getByText('Kein Limit gesetzt')).toBeInTheDocument()
  })

  it('says when nothing was asked and when the key cannot be read', async () => {
    const empty: AdminChatUsage = {
      ...usage,
      days: usage.days.map((day) => ({ ...day, ...totals() })),
      models: [],
      totals: { today: totals(), last7Days: totals(), last30Days: totals() },
      credits: null,
      creditsStatus: 'error',
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(empty), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    render(<ChatUsageSection />)

    expect(
      await screen.findByText('In den letzten 30 Tagen wurden keine Fragen gestellt.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Die Ausgaben des Schlüssels ließen sich gerade nicht abrufen.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
