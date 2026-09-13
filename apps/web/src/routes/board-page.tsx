import {
  type AttemptEntry,
  analyzeWhatIf,
  createIcs,
  creditRequirements,
  localIsoDate,
  moveModule,
  type Plan,
  planDeadlines,
  semesterIndexAt,
  setExamDate,
  setModuleAttempts,
  setTargetGrade,
  summarizePlan,
  upcomingDeadlines,
  validatePlan,
} from '@study-plan/shared'
import { Navigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountSyncBanner } from '../components/account-sync.tsx'
import { useAnnounce } from '../components/announcer.tsx'
import { AppHeader } from '../components/app-header.tsx'
import { GradeDialog } from '../components/board/grade-dialog.tsx'
import { ModuleDetailsDialog } from '../components/board/module-details-dialog.tsx'
import { PlanInsights } from '../components/board/plan-insights.tsx'
import { columnTitle, SemesterBoard } from '../components/board/semester-board.tsx'
import { SummaryPanel } from '../components/board/summary-panel.tsx'
import { StorageNotice } from '../components/storage-notice.tsx'
import i18n from '../i18n/index.ts'
import { useModuleDropMonitor } from '../lib/dnd.ts'
import { calendarFilename, downloadFile } from '../lib/files.ts'
import { formatGrade } from '../lib/format.ts'
import { describeIssues } from '../lib/issues.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

/** How far ahead the deadlines card looks. The calendar export always contains every deadline. */
const DEADLINE_HORIZON_DAYS = 120

export function BoardPage() {
  const { plan } = useGuestState()
  if (!plan) return <Navigate to="/start" replace />
  return <Board plan={plan} />
}

function describeAttempts(entries: readonly AttemptEntry[]): string {
  const latest = entries.at(-1)
  if (!latest) return i18n.t('board:announce.resultRemoved')
  switch (latest.kind) {
    case 'graded':
      return i18n.t('board:announce.graded', { grade: formatGrade(latest.grade) })
    case 'passed':
    case 'failed':
    case 'registered':
    case 'absent':
    case 'withdrawn':
      return i18n.t(`board:announce.${latest.kind}`)
  }
}

function Board({ plan }: { plan: Plan }) {
  const { t, i18n: instance } = useTranslation('board')
  const language = instance.resolvedLanguage
  const store = useGuestStore()
  const announce = useAnnounce()
  const [gradingCode, setGradingCode] = useState<string | null>(null)
  const [detailsCode, setDetailsCode] = useState<string | null>(null)
  const today = localIsoDate(new Date())

  const summary = useMemo(() => summarizePlan(plan), [plan])
  const currentIndex = useMemo(() => semesterIndexAt(plan.startTerm, new Date()), [plan.startTerm])
  // Issue texts are worded in the current language, so they are rebuilt when it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: language is a deliberate extra dependency
  const issues = useMemo(() => describeIssues(plan, validatePlan(plan)), [plan, language])
  const whatIf = useMemo(() => analyzeWhatIf(plan, plan.targetGrade), [plan])
  const requirements = useMemo(() => creditRequirements(plan).filter((item) => !item.passed), [plan])
  const allDeadlines = useMemo(() => planDeadlines(plan), [plan])
  const upcoming = useMemo(() => upcomingDeadlines(plan, today, DEADLINE_HORIZON_DAYS), [plan, today])

  const move = useCallback(
    (code: string, targetColumnId: string | null, targetIndex?: number) => {
      const name = plan.modules.find((m) => m.code === code)?.name ?? code
      store.updatePlan((current) => moveModule(current, code, targetColumnId, targetIndex))
      announce(t('announce.moved', { name, column: columnTitle(plan, targetColumnId) }))
    },
    [plan, store, announce, t],
  )
  useModuleDropMonitor(move)

  const saveResult = (code: string, entries: AttemptEntry[], examDate: string | null) => {
    const name = plan.modules.find((m) => m.code === code)?.name ?? code
    store.updatePlan((current) => setExamDate(setModuleAttempts(current, code, entries), code, examDate))
    setGradingCode(null)
    announce(`${name}: ${describeAttempts(entries)}`)
  }

  const changeTarget = (grade: number | null) => {
    store.updatePlan((current) => setTargetGrade(current, grade))
  }

  const exportCalendar = () => {
    const content = createIcs(allDeadlines, {
      calendarName: t('deadlines.calendarName', { name: plan.name }),
      now: new Date(),
      summarize: (event) =>
        event.kind === 'exam'
          ? t('deadlines.calendarExam', { module: event.moduleName })
          : t('deadlines.calendarWithdrawal', { module: event.moduleName }),
    })
    downloadFile(calendarFilename(plan), content, 'text/calendar')
  }

  return (
    <main className="mx-auto max-w-[96rem] space-y-4 px-4 py-5 sm:px-6">
      <AppHeader plan={plan} />
      <div className="space-y-4 empty:hidden print:hidden">
        <StorageNotice plan={plan} />
        <AccountSyncBanner />
      </div>
      <SummaryPanel plan={plan} summary={summary} />
      <div className="print:hidden">
        <PlanInsights
          plan={plan}
          hints={issues.list}
          whatIf={whatIf}
          requirements={requirements}
          today={today}
          upcoming={upcoming}
          canExportCalendar={allDeadlines.length > 0}
          onTargetChange={changeTarget}
          onExportCalendar={exportCalendar}
        />
      </div>
      <SemesterBoard
        plan={plan}
        summary={summary}
        currentIndex={currentIndex}
        onMove={move}
        onGrade={setGradingCode}
        onDetails={setDetailsCode}
        notesByCode={issues.byModule}
      />
      <GradeDialog
        module={plan.modules.find((m) => m.code === gradingCode) ?? null}
        plan={plan}
        onSave={saveResult}
        onClose={() => setGradingCode(null)}
      />
      <ModuleDetailsDialog
        module={plan.modules.find((m) => m.code === detailsCode) ?? null}
        plan={plan}
        onClose={() => setDetailsCode(null)}
      />
    </main>
  )
}
