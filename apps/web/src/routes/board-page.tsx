import {
  moveModule,
  type Plan,
  type ResultEntry,
  semesterIndexAt,
  setModuleResult,
  summarizePlan,
} from '@study-plan/shared'
import { Navigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useAnnounce } from '../components/announcer.tsx'
import { AppHeader } from '../components/app-header.tsx'
import { GradeDialog } from '../components/board/grade-dialog.tsx'
import { columnTitle, SemesterBoard } from '../components/board/semester-board.tsx'
import { SummaryPanel } from '../components/board/summary-panel.tsx'
import { StorageNotice } from '../components/storage-notice.tsx'
import { useModuleDropMonitor } from '../lib/dnd.ts'
import { formatGrade } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

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
  const summary = useMemo(() => summarizePlan(plan), [plan])
  const currentIndex = useMemo(() => semesterIndexAt(plan.startTerm, new Date()), [plan.startTerm])

  const move = useCallback(
    (code: string, targetColumnId: string | null, targetIndex?: number) => {
      const name = plan.modules.find((m) => m.code === code)?.name ?? code
      store.updatePlan((current) => moveModule(current, code, targetColumnId, targetIndex))
      announce(`${name} nach ${columnTitle(plan, targetColumnId)} verschoben`)
    },
    [plan, store, announce],
  )
  useModuleDropMonitor(move)

  const saveResult = (code: string, entry: ResultEntry) => {
    const name = plan.modules.find((m) => m.code === code)?.name ?? code
    store.updatePlan((current) => setModuleResult(current, code, entry))
    setGradingCode(null)
    announce(`${name}: ${describeEntry(entry)}`)
  }

  return (
    <main className="mx-auto max-w-[96rem] space-y-4 px-4 py-5 sm:px-6">
      <AppHeader plan={plan} />
      <StorageNotice plan={plan} />
      <SummaryPanel plan={plan} summary={summary} />
      <SemesterBoard
        plan={plan}
        summary={summary}
        currentIndex={currentIndex}
        onMove={move}
        onGrade={setGradingCode}
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
