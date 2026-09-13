import {
  analyzeWhatIf,
  createIcs,
  localIsoDate,
  moveModule,
  type Plan,
  planDeadlines,
  type ResultEntry,
  semesterIndexAt,
  setExamDate,
  setModuleResult,
  setTargetGrade,
  summarizePlan,
  upcomingDeadlines,
  validatePlan,
} from '@study-plan/shared'
import { Navigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useAnnounce } from '../components/announcer.tsx'
import { AppHeader } from '../components/app-header.tsx'
import { GradeDialog } from '../components/board/grade-dialog.tsx'
import { PlanInsights } from '../components/board/plan-insights.tsx'
import { columnTitle, SemesterBoard } from '../components/board/semester-board.tsx'
import { SummaryPanel } from '../components/board/summary-panel.tsx'
import { StorageNotice } from '../components/storage-notice.tsx'
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

function describeEntry(entry: ResultEntry): string {
  switch (entry.kind) {
    case 'graded':
      return `Note ${formatGrade(entry.grade)} eingetragen`
    case 'passed':
      return 'als bestanden eingetragen'
    case 'failed':
      return 'als nicht bestanden eingetragen'
    case 'open':
      return 'Ergebnis entfernt'
  }
}

function Board({ plan }: { plan: Plan }) {
  const store = useGuestStore()
  const announce = useAnnounce()
  const [gradingCode, setGradingCode] = useState<string | null>(null)
  const today = localIsoDate(new Date())

  const summary = useMemo(() => summarizePlan(plan), [plan])
  const currentIndex = useMemo(() => semesterIndexAt(plan.startTerm, new Date()), [plan.startTerm])
  const issues = useMemo(() => describeIssues(plan, validatePlan(plan)), [plan])
  const whatIf = useMemo(() => analyzeWhatIf(plan, plan.targetGrade), [plan])
  const allDeadlines = useMemo(() => planDeadlines(plan), [plan])
  const upcoming = useMemo(() => upcomingDeadlines(plan, today, DEADLINE_HORIZON_DAYS), [plan, today])

  const move = useCallback(
    (code: string, targetColumnId: string | null, targetIndex?: number) => {
      const name = plan.modules.find((m) => m.code === code)?.name ?? code
      store.updatePlan((current) => moveModule(current, code, targetColumnId, targetIndex))
      announce(`${name} nach ${columnTitle(plan, targetColumnId)} verschoben`)
    },
    [plan, store, announce],
  )
  useModuleDropMonitor(move)

  const saveResult = (code: string, entry: ResultEntry, examDate: string | null) => {
    const name = plan.modules.find((m) => m.code === code)?.name ?? code
    store.updatePlan((current) => setExamDate(setModuleResult(current, code, entry), code, examDate))
    setGradingCode(null)
    announce(`${name}: ${describeEntry(entry)}`)
  }

  const changeTarget = (grade: number | null) => {
    store.updatePlan((current) => setTargetGrade(current, grade))
  }

  const exportCalendar = () => {
    const content = createIcs(allDeadlines, {
      calendarName: `${plan.name}: Prüfungstermine`,
      now: new Date(),
      summarize: (event) =>
        `${event.kind === 'exam' ? 'Prüfung' : 'Letzter Tag zur Abmeldung'}: ${event.moduleName}`,
    })
    downloadFile(calendarFilename(plan), content, 'text/calendar')
  }

  return (
    <main className="mx-auto max-w-[96rem] space-y-4 px-4 py-5 sm:px-6">
      <AppHeader plan={plan} />
      <StorageNotice plan={plan} />
      <SummaryPanel plan={plan} summary={summary} />
      <PlanInsights
        plan={plan}
        hints={issues.list}
        whatIf={whatIf}
        today={today}
        upcoming={upcoming}
        canExportCalendar={allDeadlines.length > 0}
        onTargetChange={changeTarget}
        onExportCalendar={exportCalendar}
      />
      <SemesterBoard
        plan={plan}
        summary={summary}
        currentIndex={currentIndex}
        onMove={move}
        onGrade={setGradingCode}
        notesByCode={issues.byModule}
      />
      <GradeDialog
        module={plan.modules.find((m) => m.code === gradingCode) ?? null}
        rules={plan.rules}
        creditLabel={plan.preset.creditLabel}
        showCode={plan.preset.codesAreOfficial ?? true}
        onSave={saveResult}
        onClose={() => setGradingCode(null)}
      />
    </main>
  )
}
