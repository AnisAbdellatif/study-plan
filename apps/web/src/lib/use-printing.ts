import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * True while the browser prepares or shows the print preview. Content that only exists for printing can mount
 * then instead of being kept in the page all the time.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    // The print layout is taken right after beforeprint, so the update has to reach the DOM synchronously.
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return printing
}
