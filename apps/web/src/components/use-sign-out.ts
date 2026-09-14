import { useNavigate } from '@tanstack/react-router'
import { appGradeKeyring } from '../lib/app-grade-keyring.ts'
import { authClient } from '../lib/auth-client.ts'
import { useGuestStore } from '../store/guest-store.ts'
import { useAccountSync } from './account-sync.tsx'

/**
 * Signing out leaves nothing of the account's plan behind in this browser: syncing stops first (so clearing the
 * local plan never reaches the account), then the local plan and the grade key are removed and the start page
 * opens. The plan stays saved in the account and comes back after signing in again.
 */
export function useSignOut(): () => Promise<void> {
  const { sync, user } = useAccountSync()
  const store = useGuestStore()
  const navigate = useNavigate()
  return async () => {
    await authClient.signOut()
    sync.stop()
    store.replacePlan(null)
    if (user) await appGradeKeyring.forget(user.id)
    await navigate({ to: '/start' })
  }
}
