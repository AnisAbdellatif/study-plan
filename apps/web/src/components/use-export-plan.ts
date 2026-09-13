import { createGuestDocument, type Plan } from '@study-plan/shared'
import { useCallback } from 'react'
import { downloadJson, exportFilename } from '../lib/files.ts'
import { useGuestStore } from '../store/guest-store.ts'

export function useExportPlan(): (plan: Plan) => void {
  const store = useGuestStore()
  return useCallback(
    (plan: Plan) => {
      const now = new Date()
      downloadJson(exportFilename(plan, now), createGuestDocument(plan))
      store.markExported(now)
    },
    [store],
  )
}
