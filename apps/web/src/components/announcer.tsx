import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'

const AnnounceContext = createContext<(message: string) => void>(() => {})

/** A polite live region so screen reader users hear the result of moves and edits. */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const announce = useCallback((text: string) => setMessage(text), [])
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  )
}

export const useAnnounce = (): ((message: string) => void) => useContext(AnnounceContext)
