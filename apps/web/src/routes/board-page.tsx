import {
  type AttemptEntry,
  addCustomModule,
  addPlaceholder,
  analyzeWhatIf,
  type CustomModuleInput,
  choosePlaceholder,
  createIcs,
  creditRequirements,
  graduationForecast,
  insertSemester,
  isPlaceholderId,
  localIsoDate,
  moveModule,
  moveSemester,
  PLACEHOLDER_PREFIX,
  type Plan,
  PlanError,
  planDeadlines,
  type RecognitionInput,
  removeCustomModule,
  removePlaceholder,
  removeSemester,
  semesterIndexAt,
  setExamDate,
  setModuleAttempts,
  setRecognition,
  setSemesterKind,
  setTargetGrade,
  summarizePlan,
  unchooseModule,
  upcomingDeadlines,
  updateCustomModule,
  validatePlan,
} from '@study-plan/shared'
import { Navigate } from '@tanstack/react-router'
import { ChartNoAxesColumn, LayoutGrid, ListChecks, MessageCircle } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountSyncBanner } from '../components/account-sync.tsx'
import { useAnnounce } from '../components/announcer.tsx'
import { AppHeader } from '../components/app-header.tsx'
import type { BoardActions } from '../components/board/board-actions.ts'
import { CustomModuleDialog, type CustomModuleTarget } from '../components/board/custom-module-dialog.tsx'
import { GradeDialog } from '../components/board/grade-dialog.tsx'
import { ModuleDetailsDialog } from '../components/board/module-details-dialog.tsx'
import { type PickerTarget, PlaceholderPickerDialog } from '../components/board/placeholder-picker-dialog.tsx'
import { PlanInsights } from '../components/board/plan-insights.tsx'
import { PlanOverview } from '../components/board/plan-overview.tsx'
import { columnTitle, placeholderAreaName, SemesterBoard } from '../components/board/semester-board.tsx'
import { SummaryPanel } from '../components/board/summary-panel.tsx'
import { SiteFooter } from '../components/site-footer.tsx'
import { StorageNotice } from '../components/storage-notice.tsx'
import { StudyAssistant } from '../components/study-assistant.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog, Dialog } from '../components/ui/dialog.tsx'
import i18n from '../i18n/index.ts'
import { cn } from '../lib/cn.ts'
import { useModuleDropMonitor, useSemesterDropMonitor } from '../lib/dnd.ts'
import { calendarFilename, downloadFile } from '../lib/files.ts'
import { formatGrade, newId } from '../lib/format.ts'
import { describeIssues } from '../lib/issues.ts'
import { useMediaQuery } from '../lib/use-media-query.ts'
import { usePrinting } from '../lib/use-printing.ts'
import { useStableHandlers } from '../lib/use-stable-handlers.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

/** How far ahead the deadlines card looks. The calendar export always contains every deadline. */
const DEADLINE_HORIZON_DAYS = 120

export const BOARD_VIEW_STORAGE_KEY = 'study-plan:board-view'
const BOARD_VIEWS = ['board', 'overview'] as const
type BoardView = (typeof BOARD_VIEWS)[number]

// Storage can be missing or throw (private mode, blocked site data); the board view is the safe default.
function readBoardView(): BoardView {
  try {
    return window.localStorage.getItem(BOARD_VIEW_STORAGE_KEY) === 'overview' ? 'overview' : 'board'
  } catch {
    return 'board'
  }
}

function storeBoardView(view: BoardView) {
  try {
    window.localStorage.setItem(BOARD_VIEW_STORAGE_KEY, view)
  } catch {
    // The choice then only lasts until the page is reloaded.
  }
}

const MOBILE_TABS = [
  { id: 'plan', icon: LayoutGrid },
  { id: 'status', icon: ChartNoAxesColumn },
  { id: 'hints', icon: ListChecks },
  { id: 'assistant', icon: MessageCircle },
] as const
type MobileTab = (typeof MOBILE_TABS)[number]['id']

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

/** A fresh placeholder id, known before the plan changes so the picker can open for it. */
const newPlaceholderId = (): string =>
  `${PLACEHOLDER_PREFIX}${newId()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')}`

function Board({ plan }: { plan: Plan }) {
  const { t, i18n: instance } = useTranslation('board')
  const language = instance.resolvedLanguage
  const store = useGuestStore()
  const announce = useAnnounce()
  const [gradingCode, setGradingCode] = useState<string | null>(null)
  const [detailsCode, setDetailsCode] = useState<string | null>(null)
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [customTarget, setCustomTarget] = useState<CustomModuleTarget | null>(null)
  const [deleteCode, setDeleteCode] = useState<string | null>(null)
  const [view, setView] = useState<BoardView>(readBoardView)
  // Phones show one part of the page at a time, chosen in the bottom bar; wider screens show everything.
  const [mobileTab, setMobileTab] = useState<MobileTab>('plan')
  // One assistant at a time: inline in its tab on phones, in a dialog on wider screens.
  const wide = useMediaQuery('(min-width: 40rem)')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const changeView = (next: BoardView) => {
    setView(next)
    storeBoardView(next)
  }
  const today = localIsoDate(new Date())

  const summary = useMemo(() => summarizePlan(plan), [plan])
  const currentIndex = useMemo(() => semesterIndexAt(plan.startTerm, new Date()), [plan.startTerm])
  // Issue texts are worded in the current language, so they are rebuilt when it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: language is a deliberate extra dependency
  const issues = useMemo(
    () => describeIssues(plan, validatePlan(plan, { currentSemesterIndex: currentIndex })),
    [plan, language, currentIndex],
  )
  const whatIf = useMemo(() => analyzeWhatIf(plan, plan.targetGrade), [plan])
  const requirements = useMemo(() => creditRequirements(plan).filter((item) => !item.passed), [plan])
  const forecast = useMemo(
    () => graduationForecast(plan, { currentSemesterIndex: currentIndex }),
    [plan, currentIndex],
  )
  const allDeadlines = useMemo(() => planDeadlines(plan), [plan])
  const upcoming = useMemo(() => upcomingDeadlines(plan, today, DEADLINE_HORIZON_DAYS), [plan, today])

  const moduleName = useCallback(
    (code: string) => plan.modules.find((m) => m.code === code)?.name ?? code,
    [plan],
  )
  const areaName = useCallback(
    (areaId: string) => plan.areas.find((area) => area.id === areaId)?.name ?? areaId,
    [plan],
  )

  /** Applies a plan change; an outdated or invalid action is announced instead of breaking the page. */
  const apply = useCallback(
    (update: (current: Plan) => Plan): boolean => {
      try {
        store.updatePlan(update)
        return true
      } catch (error) {
        if (!(error instanceof PlanError)) throw error
        announce(t('announce.actionFailed'))
        return false
      }
    },
    [store, announce, t],
  )

  const move = useCallback(
    (code: string, targetColumnId: string | null, targetIndex?: number) => {
      if (isPlaceholderId(code)) {
        const area = placeholderAreaName(plan, code) ?? code
        if (!apply((current) => moveModule(current, code, targetColumnId, targetIndex))) return
        announce(
          targetColumnId === null
            ? t('announce.placeholderRemoved', { area })
            : t('announce.placeholderMoved', { area, column: columnTitle(plan, targetColumnId) }),
        )
        return
      }
      if (!apply((current) => moveModule(current, code, targetColumnId, targetIndex))) return
      announce(t('announce.moved', { name: moduleName(code), column: columnTitle(plan, targetColumnId) }))
    },
    [plan, apply, announce, t, moduleName],
  )

  const placeArea = useCallback(
    (areaId: string, semesterId: string, targetIndex?: number) => {
      if (!apply((current) => addPlaceholder(current, areaId, semesterId, targetIndex))) return
      announce(
        t('announce.placeholderAdded', { area: areaName(areaId), column: columnTitle(plan, semesterId) }),
      )
    },
    [plan, apply, announce, t, areaName],
  )

  /** Semester waiting for the delete confirmation; only non-empty semesters ask. */
  const [deleteSemesterId, setDeleteSemesterId] = useState<string | null>(null)

  const deleteSemester = useCallback(
    (semesterId: string) => {
      const title = columnTitle(plan, semesterId)
      if (apply((current) => removeSemester(current, semesterId))) {
        announce(t('announce.semesterDeleted', { column: title }))
      }
    },
    [plan, apply, announce, t],
  )

  // One object for the whole lifetime of the board: cards and columns are memoised and must not re-render just
  // because a handler now sees the newer plan.
  const actions = useStableHandlers<BoardActions>({
    onMove: move,
    onGrade: setGradingCode,
    onDetails: setDetailsCode,
    onPlaceArea: placeArea,
    onBrowseArea: (areaId) => setPicker({ mode: 'browse', areaId }),
    onChoose: (placeholderId) => setPicker({ mode: 'choose', placeholderId }),
    onRemovePlaceholder: (placeholderId) => {
      const area = placeholderAreaName(plan, placeholderId) ?? placeholderId
      if (apply((current) => removePlaceholder(current, placeholderId)))
        announce(t('announce.placeholderRemoved', { area }))
    },
    onUnchoose: (code) => {
      if (apply((current) => unchooseModule(current, code)))
        announce(t('announce.unchosen', { name: moduleName(code) }))
    },
    onChooseOther: (code) => {
      const id = newPlaceholderId()
      if (!apply((current) => unchooseModule(current, code, id.slice(PLACEHOLDER_PREFIX.length)))) return
      announce(t('announce.unchosen', { name: moduleName(code) }))
      setPicker({ mode: 'choose', placeholderId: id })
    },
    onAddCustom: () => setCustomTarget({ mode: 'create' }),
    onEditCustom: (code) => setCustomTarget({ mode: 'edit', code }),
    onDeleteCustom: setDeleteCode,
    onInsertSemester: (index) => {
      if (apply((current) => insertSemester(current, index))) {
        announce(t('announce.semesterInserted', { number: index + 1 }))
      }
    },
    onMoveSemester: (semesterId, toIndex) => {
      if (apply((current) => moveSemester(current, semesterId, toIndex))) {
        announce(t('announce.semesterMoved', { number: toIndex + 1 }))
      }
    },
    onDeleteSemester: (semesterId) => {
      const semester = plan.semesters.find((candidate) => candidate.id === semesterId)
      if (!semester) return
      if (semester.moduleCodes.length > 0) setDeleteSemesterId(semesterId)
      else deleteSemester(semesterId)
    },
    onSetSemesterKind: (semesterId, kind) => {
      if (apply((current) => setSemesterKind(current, semesterId, kind))) {
        announce(
          t('semesterMenu.kindChanged', {
            column: columnTitle(plan, semesterId),
            kind: t(`semesterMenu.kinds.${kind}`),
          }),
        )
      }
    },
  })
  useModuleDropMonitor(actions.onMove, actions.onPlaceArea)
  useSemesterDropMonitor(actions.onMoveSemester)
  const printing = usePrinting()
  const semesterToDelete = plan.semesters.find((semester) => semester.id === deleteSemesterId) ?? null

  const choose = (placeholderId: string, code: string) => {
    const area = placeholderAreaName(plan, placeholderId) ?? placeholderId
    if (!apply((current) => choosePlaceholder(current, placeholderId, code))) return
    setPicker(null)
    announce(t('announce.chosen', { name: moduleName(code), area }))
  }

  /** Throws a `PlanError` for invalid input, which the dialog shows. */
  const saveCustomModule = (target: CustomModuleTarget, input: CustomModuleInput) => {
    // Validating against the rendered plan first lets the error reach the dialog before anything is stored.
    if (target.mode === 'create') {
      addCustomModule(plan, input)
      store.updatePlan((current) => addCustomModule(current, input).plan)
    } else {
      updateCustomModule(plan, target.code, input)
      store.updatePlan((current) => updateCustomModule(current, target.code, input))
    }
    setCustomTarget(null)
    const name = input.name.trim()
    announce(t(target.mode === 'create' ? 'announce.customAdded' : 'announce.customUpdated', { name }))
  }

  const deleteCustomModule = (code: string) => {
    const name = moduleName(code)
    if (apply((current) => removeCustomModule(current, code))) announce(t('announce.customDeleted', { name }))
  }

  const saveResult = (
    code: string,
    entries: AttemptEntry[],
    examDate: string | null,
    recognition: RecognitionInput | null,
  ) => {
    const saved = apply((current) =>
      setRecognition(
        setExamDate(setModuleAttempts(current, code, entries), code, examDate),
        code,
        recognition,
      ),
    )
    if (!saved) return
    setGradingCode(null)
    announce(`${moduleName(code)}: ${describeAttempts(entries)}`)
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
    // On phones main fills the screen, so the bottom bar sits at the bottom edge even on short pages. The legal links
    // live inside main there (above the bar), so nothing below main can push the bar up.
    <main className="mx-auto max-w-[240rem] space-y-4 px-4 pt-5 max-sm:flex max-sm:min-h-dvh max-sm:flex-col sm:px-6 sm:pb-5">
      <AppHeader plan={plan} />
      <div className="space-y-4 empty:hidden print:hidden">
        <StorageNotice plan={plan} />
        <AccountSyncBanner />
      </div>
      <div className={mobileTab === 'status' ? undefined : 'max-sm:hidden print:block!'}>
        <SummaryPanel plan={plan} summary={summary} />
      </div>
      <div className={cn('print:hidden', mobileTab !== 'hints' && 'max-sm:hidden')}>
        <PlanInsights
          plan={plan}
          hints={issues.list}
          forecast={forecast}
          whatIf={whatIf}
          requirements={requirements}
          today={today}
          upcoming={upcoming}
          canExportCalendar={allDeadlines.length > 0}
          onTargetChange={changeTarget}
          onExportCalendar={exportCalendar}
        />
      </div>
      <div className={cn('space-y-4', mobileTab !== 'plan' && 'max-sm:hidden print:block!')}>
        {/* Native radios give arrow-key navigation and the checked state for free; the label is the visible segment. */}
        <fieldset className="print:hidden">
          <legend className="sr-only">{t('view.label')}</legend>
          <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {BOARD_VIEWS.map((option) => (
              <label
                key={option}
                className={
                  view === option
                    ? 'flex h-8 cursor-pointer items-center rounded-md bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'flex h-8 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-zinc-600 hover:text-zinc-900 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100'
                }
              >
                <input
                  type="radio"
                  name="board-view"
                  value={option}
                  checked={view === option}
                  onChange={() => changeView(option)}
                  className="sr-only"
                />
                {t(`view.${option}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {view === 'board' && (
          <div className="print:hidden">
            <SemesterBoard
              plan={plan}
              summary={summary}
              currentIndex={currentIndex}
              actions={actions}
              notesByCode={issues.byModule}
            />
          </div>
        )}
        {/* Printing always gives the overview. On the board it only mounts for printing, so edits don't rebuild it. */}
        {view === 'overview' || printing ? (
          <div className={view === 'overview' ? undefined : 'hidden print:block'}>
            <PlanOverview plan={plan} summary={summary} />
          </div>
        ) : null}
      </div>
      {!wide && mobileTab === 'assistant' ? (
        <section aria-label={t('assistant.title')}>
          <StudyAssistant onOpenModule={setDetailsCode} layout="page" />
        </section>
      ) : null}
      <div className="mt-auto sm:hidden print:hidden">
        <SiteFooter placement="board" />
      </div>
      <nav
        aria-label={t('mobileNav.label')}
        // Sticky inside main: it stays at the bottom of the screen and never covers the legal links.
        className="sticky bottom-0 z-30 -mx-4 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
      >
        <div className="grid grid-cols-4">
          {MOBILE_TABS.map(({ id, icon: Icon }) => {
            const active = mobileTab === id
            const warnings =
              id === 'hints' ? issues.list.filter((issue) => issue.severity !== 'info').length : 0
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                // The count joins the name ("Hinweise, 7 Warnungen") rather than being extra text on the page.
                aria-label={
                  warnings > 0
                    ? `${t(`mobileNav.${id}`)}, ${t('mobileNav.warnings', { count: warnings })}`
                    : undefined
                }
                onClick={() => {
                  setMobileTab(id)
                  window.scrollTo({ top: 0 })
                }}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-400',
                )}
              >
                <Icon aria-hidden className="size-5" />
                {t(`mobileNav.${id}`)}
                {warnings > 0 ? (
                  <span className="absolute top-1.5 left-[calc(50%+0.5rem)] min-w-5 rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 font-semibold text-amber-950">
                    <span aria-hidden>{warnings}</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>
      <ConfirmDialog
        open={semesterToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteSemesterId(null)
        }}
        title={
          semesterToDelete
            ? t('semesterMenu.deleteTitle', { column: columnTitle(plan, semesterToDelete.id) })
            : ''
        }
        description={t('semesterMenu.deleteDescription', {
          count: semesterToDelete?.moduleCodes.length ?? 0,
        })}
        confirmLabel={t('semesterMenu.deleteConfirm')}
        destructive
        onConfirm={() => {
          if (semesterToDelete) deleteSemester(semesterToDelete.id)
          setDeleteSemesterId(null)
        }}
      />
      <GradeDialog
        module={plan.modules.find((m) => m.code === gradingCode) ?? null}
        plan={plan}
        onSave={saveResult}
        onClose={() => setGradingCode(null)}
      />
      {wide ? (
        <Button
          variant="primary"
          className="fixed right-6 bottom-6 z-30 rounded-full shadow-lg print:hidden"
          onClick={() => setAssistantOpen(true)}
        >
          <MessageCircle aria-hidden className="size-4" />
          {t('assistant.title')}
        </Button>
      ) : null}
      <Dialog
        open={wide && assistantOpen}
        onOpenChange={setAssistantOpen}
        title={t('assistant.title')}
        size="lg"
        fill
      >
        <StudyAssistant onOpenModule={setDetailsCode} className="min-h-0 flex-1" showTitle={false} />
      </Dialog>
      <ModuleDetailsDialog
        module={plan.modules.find((m) => m.code === detailsCode) ?? null}
        plan={plan}
        onClose={() => setDetailsCode(null)}
      />
      <PlaceholderPickerDialog
        plan={plan}
        summary={summary}
        target={picker}
        onChoose={choose}
        onClose={() => setPicker(null)}
      />
      <CustomModuleDialog
        plan={plan}
        target={customTarget}
        onSave={saveCustomModule}
        onClose={() => setCustomTarget(null)}
      />
      <ConfirmDialog
        open={deleteCode !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCode(null)
        }}
        title={t('customModule.deleteTitle', { name: deleteCode ? moduleName(deleteCode) : '' })}
        description={t('customModule.deleteDescription')}
        confirmLabel={t('customModule.deleteConfirm')}
        destructive
        onConfirm={() => {
          if (deleteCode) deleteCustomModule(deleteCode)
        }}
      />
    </main>
  )
}
