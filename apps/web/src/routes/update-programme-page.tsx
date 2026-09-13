import { applyPresetUpdate, diffPresetUpdate, hasPresetChanges, type Plan } from '@study-plan/shared'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAnnounce } from '../components/announcer.tsx'
import { PresetDiffList } from '../components/board/preset-diff.tsx'
import { AnswerPanel } from '../components/programme-extraction/answer-panel.tsx'
import { DescribeForm } from '../components/programme-extraction/describe-form.tsx'
import {
  type ExtractionDraft,
  loadDraft,
  useProgrammeExtraction,
} from '../components/programme-extraction/draft.ts'
import { PresetPreview } from '../components/programme-extraction/preset-preview.tsx'
import { PromptPanel } from '../components/programme-extraction/prompt-panel.tsx'
import { Section } from '../components/programme-extraction/section.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

export const UPDATE_DRAFT_KEY = 'study-plan:programme-update-draft'

export function UpdateProgrammePage() {
  const { plan } = useGuestState()
  if (!plan) return <Navigate to="/start" replace />
  return <UpdateProgramme plan={plan} />
}

const draftFromPlan = (plan: Plan): ExtractionDraft => ({
  universityName: plan.preset.universityName,
  programmeName: plan.preset.programmeName,
  degree: plan.preset.degree,
  // Empty on purpose: a typed version overrides what the LLM reads, so the new PO's version would be lost.
  poVersion: '',
  answer: '',
  promptFor: null,
  planId: plan.id,
})

function UpdateProgramme({ plan }: { plan: Plan }) {
  const { t } = useTranslation(['customPreset', 'common'])
  const store = useGuestStore()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const existingModules = useMemo(
    () => plan.modules.filter((module) => !module.retired).map(({ code, name }) => ({ code, name })),
    [plan.modules],
  )
  const extraction = useProgrammeExtraction({
    draftKey: UPDATE_DRAFT_KEY,
    initialDraft: () => {
      const saved = loadDraft(UPDATE_DRAFT_KEY)
      return saved && saved.planId === plan.id ? saved : draftFromPlan(plan)
    },
    existingModules,
  })
  const { draft, result } = extraction

  // The plan keeps its programme id, so an update of the same data changes nothing.
  const incoming = useMemo(
    () => (result?.success ? { ...result.preset, id: plan.preset.id } : null),
    [result, plan.preset.id],
  )
  const diff = useMemo(() => (incoming ? diffPresetUpdate(plan, incoming) : null), [plan, incoming])
  const changes = diff !== null && hasPresetChanges(diff)

  const apply = () => {
    if (!incoming) return
    store.updatePlan((current) => applyPresetUpdate(current, incoming))
    extraction.finish()
    announce(t('update.announced', { poVersion: incoming.poVersion }))
    void navigate({ to: '/' })
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="text-sm font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
      >
        {t('update.back')}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{t('update.title')}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('update.intro')}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>{t('update.whenNewPo')}</li>
        <li>{t('update.whenHandbook')}</li>
        <li>{t('update.whenCorrection')}</li>
      </ul>

      <DescribeForm
        draft={draft}
        onChange={extraction.update}
        onGenerate={extraction.generate}
        intro={t('update.describeIntro', { plan: plan.name })}
        poVersionHint={t('update.poVersionHint', { poVersion: plan.preset.poVersion })}
      />

      {draft.promptFor ? (
        <>
          <PromptPanel prompt={extraction.prompt} promptFor={draft.promptFor} note={t('update.promptNote')} />
          <AnswerPanel
            answer={draft.answer}
            onAnswerChange={extraction.setAnswer}
            onCheck={extraction.check}
            result={result}
          >
            {result?.success ? <PresetPreview preset={result.preset} warnings={result.warnings} /> : null}
          </AnswerPanel>
        </>
      ) : null}

      {draft.promptFor && diff ? (
        <Section heading={t('update.changesHeading')}>
          {changes ? (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('update.kept')}</p>
              <PresetDiffList diff={diff} />
              <Button variant="primary" className="w-full" onClick={() => setConfirmOpen(true)}>
                {t('update.submit')}
              </Button>
            </>
          ) : (
            <p role="status" className="text-sm">
              {t('update.noChanges')}
            </p>
          )}
        </Section>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('update.confirmTitle')}
        description={t('update.confirmDescription')}
        confirmLabel={t('update.confirm')}
        onConfirm={apply}
      />
    </main>
  )
}
