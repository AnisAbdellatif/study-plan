import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isLocale, LOCALE_STORAGE_KEY, type Locale } from '../i18n/config.ts'
import { authClient } from '../lib/auth-client.ts'

export type LocaleSyncAction =
  | { kind: 'none' }
  | { kind: 'adopt'; locale: Locale }
  | { kind: 'update'; locale: Locale }

export interface LocaleSyncInput {
  /** The language the UI shows right now. */
  uiLocale: Locale
  /** `locale` of the signed-in account, as the session reports it. */
  accountLocale: unknown
  /** Whether this browser remembers an explicit language choice. */
  hasSavedChoice: boolean
  /** True for the first check after an account signs in. */
  firstCheck: boolean
}

/**
 * Keeps the account's language in step with the UI. Right after sign-in, a browser without its own choice
 * takes the account's language; otherwise the UI language wins and is saved to the account.
 */
export function decideLocaleSync({
  uiLocale,
  accountLocale,
  hasSavedChoice,
  firstCheck,
}: LocaleSyncInput): LocaleSyncAction {
  if (accountLocale === uiLocale) return { kind: 'none' }
  if (firstCheck && !hasSavedChoice && isLocale(accountLocale))
    return { kind: 'adopt', locale: accountLocale }
  return { kind: 'update', locale: uiLocale }
}

function hasSavedChoice(): boolean {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** Renders nothing. Saves the UI language to the signed-in account so e-mails use it too. */
export function LocaleSync() {
  const { i18n } = useTranslation()
  const session = authClient.useSession()
  const user = session.data?.user
  const userId = user?.id ?? null
  const accountLocale = user?.locale
  const uiLocale: Locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'de'
  const checkedUser = useRef<string | null>(null)
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!userId) {
      checkedUser.current = null
      lastSent.current = null
      return
    }
    const action = decideLocaleSync({
      uiLocale,
      accountLocale,
      hasSavedChoice: hasSavedChoice(),
      firstCheck: checkedUser.current !== userId,
    })
    checkedUser.current = userId
    if (action.kind === 'adopt') {
      void i18n.changeLanguage(action.locale)
    } else if (action.kind === 'update') {
      // Send each change once; a failed request is retried with the next language change or sign-in.
      const key = `${userId}:${action.locale}`
      if (lastSent.current === key) return
      lastSent.current = key
      void Promise.resolve()
        .then(() => authClient.updateUser({ locale: action.locale }))
        .catch(() => {})
    }
  }, [userId, accountLocale, uiLocale, i18n])

  return null
}
