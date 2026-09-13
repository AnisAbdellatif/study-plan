import {
  buildExtractionPrompt,
  type CustomPresetResult,
  type CustomProgrammeInput,
  parseCustomPreset,
} from '@study-plan/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { newId } from '../../lib/format.ts'

export type Degree = CustomProgrammeInput['degree']

export interface ExtractionDraft {
  universityName: string
  programmeName: string
  degree: Degree
  poVersion: string
  answer: string
  /** The details the prompt was generated for. The answer is parsed with these. */
  promptFor: CustomProgrammeInput | null
  /** The plan an update draft belongs to. */
  planId?: string
}

export const emptyDraft: ExtractionDraft = {
  universityName: '',
  programmeName: '',
  degree: 'bsc',
  poVersion: '',
  answer: '',
  promptFor: null,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toInput(
  universityName: string,
  programmeName: string,
  degree: Degree,
  poVersion: string,
): CustomProgrammeInput {
  const input: CustomProgrammeInput = {
    universityName: universityName.trim(),
    programmeName: programmeName.trim(),
    degree,
  }
  if (poVersion.trim()) input.poVersion = poVersion.trim()
  return input
}

/** sessionStorage content is untrusted: every field is checked before use. */
export function loadDraft(key: string): ExtractionDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data)) return null
    const saved = data.promptFor
    const promptFor =
      isRecord(saved) && text(saved.universityName).trim() && text(saved.programmeName).trim()
        ? toInput(
            text(saved.universityName),
            text(saved.programmeName),
            saved.degree === 'msc' ? 'msc' : 'bsc',
            text(saved.poVersion),
          )
        : null
    return {
      universityName: text(data.universityName),
      programmeName: text(data.programmeName),
      degree: data.degree === 'msc' ? 'msc' : 'bsc',
      poVersion: text(data.poVersion),
      answer: text(data.answer),
      promptFor,
      ...(typeof data.planId === 'string' ? { planId: data.planId } : {}),
    }
  } catch {
    return null
  }
}

function saveDraft(key: string, draft: ExtractionDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Without storage the draft lasts until the page is left.
  }
}

function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Nothing to clear.
  }
}

export interface ProgrammeExtractionOptions {
  draftKey: string
  initialDraft: () => ExtractionDraft
  /** Modules of the current plan, so the LLM keeps their codes. Keep the array stable between renders. */
  existingModules?: readonly { code: string; name: string }[]
}

/** Draft, prompt and answer check shared by the start and the update flow. */
export function useProgrammeExtraction({
  draftKey,
  initialDraft,
  existingModules,
}: ProgrammeExtractionOptions) {
  const [draft, setDraft] = useState<ExtractionDraft>(initialDraft)
  const [result, setResult] = useState<CustomPresetResult | null>(null)
  const [idSuffix] = useState(() => newId().replace(/-/g, '').slice(0, 8))
  const finished = useRef(false)

  useEffect(() => {
    if (!finished.current) saveDraft(draftKey, draft)
  }, [draftKey, draft])

  const update = (changes: Partial<ExtractionDraft>) => setDraft((current) => ({ ...current, ...changes }))
  const promptFor = draft.promptFor
  const prompt = useMemo(
    () => (promptFor ? buildExtractionPrompt(promptFor, existingModules ? { existingModules } : {}) : ''),
    [promptFor, existingModules],
  )

  return {
    draft,
    update,
    result,
    prompt,
    generate: (input: CustomProgrammeInput) => {
      update({ promptFor: input })
      setResult(null)
    },
    setAnswer: (answer: string) => {
      update({ answer })
      setResult(null)
    },
    check: () => {
      if (promptFor) setResult(parseCustomPreset(draft.answer, promptFor, idSuffix))
    },
    /** Stops saving and removes the draft once it has been used. */
    finish: () => {
      finished.current = true
      clearDraft(draftKey)
    },
  }
}
