import { useLayoutEffect, useMemo, useRef } from 'react'

// biome-ignore lint/suspicious/noExplicitAny: handler signatures vary; the returned object keeps the caller's types
type Handlers = Record<string, (...args: any[]) => unknown>

/**
 * The same object with the same functions on every render, each calling the latest handler. Memoised children
 * that receive it then only re-render when their own data changes, not whenever a handler closes over new state.
 * The set of keys must not change between renders.
 */
// biome-ignore lint/suspicious/noExplicitAny: see Handlers
export function useStableHandlers<T extends { [K in keyof T]: (...args: any[]) => unknown }>(handlers: T): T {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: built once; calls always reach latest.current
  return useMemo(() => {
    const stable: Handlers = {}
    for (const key of Object.keys(handlers)) {
      stable[key] = (...args: unknown[]) => (latest.current as unknown as Handlers)[key]?.(...args)
    }
    return stable as unknown as T
  }, [])
}
