import { type ReactNode, useEffect, useId, useState } from 'react'

export const cardClass = 'rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
export const hintClass = 'text-xs text-zinc-600 dark:text-zinc-400'

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`mt-6 space-y-4 ${cardClass}`}>
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  )
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/** Copies text and remembers whether it worked. A success message disappears after a few seconds. */
export function useCopy() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (!ok) return
    const timer = setTimeout(() => setOk(null), 4000)
    return () => clearTimeout(timer)
  }, [ok])
  return { ok, copy: async (value: string) => setOk(await writeClipboard(value)) }
}
