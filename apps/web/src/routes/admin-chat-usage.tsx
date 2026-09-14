import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { currentIntlLocale } from '../i18n/index.ts'
import { type AdminChatUsage, adminApi, type ChatUsageTotals } from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const mutedClass = 'text-zinc-600 dark:text-zinc-400'

const PERIODS = ['today', 'last7Days', 'last30Days'] as const

function useFormats() {
  const { i18n } = useTranslation()
  // biome-ignore lint/correctness/useExhaustiveDependencies: the formats follow the language
  return useMemo(() => {
    const locale = currentIntlLocale()
    const number = new Intl.NumberFormat(locale)
    const cost = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
    // Report days are calendar dates; formatting them in UTC keeps the date as it is.
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    return {
      number: (value: number) => number.format(value),
      cost: (value: number) => cost.format(value),
      day: (value: string) => day.format(new Date(`${value}T00:00:00Z`)),
    }
  }, [i18n.language])
}

/** Questions, tokens and cost of the study assistant, and what the OpenRouter key has spent. */
export function ChatUsageSection() {
  const { t } = useTranslation(['admin', 'common'])
  const [usage, setUsage] = useState<AdminChatUsage | 'loading' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setUsage(await adminApi.chatUsage())
    } catch {
      setUsage('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section aria-labelledby="admin-chat-usage" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admin-chat-usage" className="text-lg font-semibold">
          {t('chatUsage.heading')}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true)
            await load()
            setRefreshing(false)
          }}
        >
          <RefreshCw aria-hidden className="size-4" />
          {t('chatUsage.refresh')}
        </Button>
      </div>
      <p className={`text-sm ${mutedClass}`}>{t('chatUsage.intro')}</p>
      {usage === 'loading' ? (
        <LoadingText>{t('common:loading')}</LoadingText>
      ) : usage === 'error' ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t('chatUsage.loadError')}
        </p>
      ) : (
        <UsageReport usage={usage} />
      )}
    </section>
  )
}

function UsageReport({ usage }: { usage: AdminChatUsage }) {
  const { t } = useTranslation('admin')
  const format = useFormats()
  const tokens = (totals: ChatUsageTotals) => totals.promptTokens + totals.completionTokens

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {PERIODS.map((period) => {
          const totals = usage.totals[period]
          return (
            <div key={period} className={cardClass}>
              <p className={mutedClass}>{t(`chatUsage.periods.${period}`)}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{format.cost(totals.cost)}</p>
              <p className="tabular-nums">
                {t('chatUsage.questions', {
                  count: totals.questions,
                  formatted: format.number(totals.questions),
                })}
                {totals.failed > 0
                  ? ` · ${t('chatUsage.failed', { count: totals.failed, formatted: format.number(totals.failed) })}`
                  : null}
              </p>
              <p className={`text-xs tabular-nums ${mutedClass}`}>
                {t('chatUsage.tokens', {
                  input: format.number(totals.promptTokens),
                  output: format.number(totals.completionTokens),
                })}
              </p>
            </div>
          )
        })}
      </div>

      <div className={cardClass}>
        <h3 className="font-semibold">{t('chatUsage.chartHeading')}</h3>
        {usage.totals.last30Days.questions === 0 ? (
          <p className={`mt-2 ${mutedClass}`}>{t('chatUsage.empty')}</p>
        ) : (
          <DailyChart usage={usage} tokens={tokens} />
        )}
      </div>

      {usage.models.length > 0 ? (
        <div className={`${cardClass} overflow-x-auto`}>
          <h3 className="font-semibold">{t('chatUsage.modelsHeading')}</h3>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className={mutedClass}>
              <tr>
                <th className="py-1 pr-4 font-medium">{t('chatUsage.columns.model')}</th>
                <th className="py-1 pr-4 text-right font-medium">{t('chatUsage.columns.questions')}</th>
                <th className="py-1 pr-4 text-right font-medium">{t('chatUsage.columns.calls')}</th>
                <th className="py-1 pr-4 text-right font-medium">{t('chatUsage.columns.input')}</th>
                <th className="py-1 pr-4 text-right font-medium">{t('chatUsage.columns.output')}</th>
                <th className="py-1 text-right font-medium">{t('chatUsage.columns.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {usage.models.map((row) => (
                <tr key={row.model} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-4 font-mono text-xs break-all">{row.model}</td>
                  <td className="py-1 pr-4 text-right">{format.number(row.questions)}</td>
                  <td className="py-1 pr-4 text-right">{format.number(row.calls)}</td>
                  <td className="py-1 pr-4 text-right">{format.number(row.promptTokens)}</td>
                  <td className="py-1 pr-4 text-right">{format.number(row.completionTokens)}</td>
                  <td className="py-1 text-right">{format.cost(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Credits usage={usage} />
    </div>
  )
}

function DailyChart({
  usage,
  tokens,
}: {
  usage: AdminChatUsage
  tokens: (totals: ChatUsageTotals) => number
}) {
  const { t } = useTranslation('admin')
  const format = useFormats()
  const max = Math.max(1, ...usage.days.map(tokens))
  const first = usage.days[0]
  const last = usage.days.at(-1)

  return (
    <>
      <div
        role="img"
        aria-label={t('chatUsage.chartLabel', { tokens: format.number(tokens(usage.totals.last30Days)) })}
        className="mt-3 flex h-28 items-end gap-0.5 border-b border-zinc-200 dark:border-zinc-800"
      >
        {usage.days.map((day) => {
          const value = tokens(day)
          return (
            <div
              key={day.day}
              title={t('chatUsage.barTitle', {
                day: format.day(day.day),
                tokens: format.number(value),
                questions: format.number(day.questions),
              })}
              className="flex-1 rounded-t-sm bg-indigo-500 dark:bg-indigo-400"
              style={{ height: value === 0 ? 0 : `${Math.max(2, (value / max) * 100)}%` }}
            />
          )
        })}
      </div>
      {first && last ? (
        <div className={`mt-1 flex justify-between text-xs ${mutedClass}`}>
          <span>{format.day(first.day)}</span>
          <span>{format.day(last.day)}</span>
        </div>
      ) : null}
    </>
  )
}

function Credits({ usage }: { usage: AdminChatUsage }) {
  const { t } = useTranslation('admin')
  const format = useFormats()
  if (usage.creditsStatus === 'unsupported') return null

  const credits = usage.credits
  const items: [string, string][] = credits
    ? [
        [t('chatUsage.credits.used'), format.cost(credits.used)],
        ...(credits.usedThisMonth === null
          ? []
          : ([[t('chatUsage.credits.month'), format.cost(credits.usedThisMonth)]] as [string, string][])),
        ...(credits.usedToday === null
          ? []
          : ([[t('chatUsage.credits.today'), format.cost(credits.usedToday)]] as [string, string][])),
        [
          t('chatUsage.credits.remaining'),
          credits.limit === null || credits.remaining === null
            ? t('chatUsage.credits.noLimit')
            : t('chatUsage.credits.ofLimit', {
                remaining: format.cost(credits.remaining),
                limit: format.cost(credits.limit),
              }),
        ],
      ]
    : []

  return (
    <div className={cardClass}>
      <h3 className="font-semibold">{t('chatUsage.credits.heading')}</h3>
      {credits ? (
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt className={mutedClass}>{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={`mt-2 ${mutedClass}`}>{t('chatUsage.credits.error')}</p>
      )}
    </div>
  )
}
