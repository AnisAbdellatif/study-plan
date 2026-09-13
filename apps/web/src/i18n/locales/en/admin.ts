import type { admin as de } from '../de/admin.ts'
import type { Messages } from '../types.ts'

export const admin = {
  title: 'Admin dashboard',
  signedInAs: 'Signed in as {{email}}',
  loadingStats: 'Loading numbers…',
  access: {
    notFound: 'Page not found',
    notFoundBody: "This page doesn't exist or you don't have access.",
    error: 'Error',
    errorBody: "The admin dashboard isn't available right now.",
    home: 'Go to the home page',
  },
  overview: {
    heading: 'Overview',
    accounts: 'Accounts',
    accountsDetail: '{{verified}} confirmed, {{newAccounts}} new in the last 30 days',
    active: 'Active in the last 30 days',
    plans: 'Plans in accounts',
    plansDetail: '{{shared}} of them shared with an active link',
    reminders: 'Reminders turned on',
    remindersDetail: '{{sent}} reminders sent in the last 30 days',
    byPreset: 'Plans per template',
    byPresetEmpty: 'No plans saved in accounts yet.',
    programme: 'Programme',
    regulations: 'Examination regulations',
    plansColumn: 'Plans',
  },
  accounts: {
    heading: 'Accounts',
    search: 'Email address contains',
    submit: 'Search',
    loadError: "The accounts couldn't be loaded.",
    empty: 'No accounts found.',
    columns: {
      email: 'Email address',
      created: 'Created',
      lastActive: 'Last active',
      plans: 'Plans',
      links: 'Links',
      actions: 'Actions',
    },
    verified: 'confirmed',
    unverified: 'not confirmed',
    remindersOn: 'reminders on',
    self: 'you',
    selfActions: 'via the account page',
    actions: {
      sendVerification: 'Resend confirmation',
      revokeShares: 'Deactivate links',
      signOut: 'Sign out everywhere',
      delete: 'Delete account…',
    },
    footnote:
      'Shows the 25 newest matching accounts. Grades and plan contents are deliberately not visible here.',
  },
  confirm: {
    send_verification_email: {
      title: 'Resend confirmation email?',
      description: '{{email}} will get a new link to confirm their email address.',
      label: 'Send',
    },
    revoke_shares: {
      title: 'Deactivate shared links?',
      description: 'All active links from {{email}} will stop working.',
      label: 'Deactivate',
    },
    sign_out: {
      title: 'Sign out everywhere?',
      description: '{{email}} will be signed out on all devices and has to sign in again.',
      label: 'Sign out',
    },
    delete_user: {
      title: 'Delete account permanently?',
      description:
        "The account {{email}} will be deleted with all its plans, links and settings. This can't be undone.",
      label: 'Delete permanently',
    },
  },
  messages: {
    verificationSent: 'Confirmation email sent to {{email}}.',
    revoked_one: '{{count}} link from {{email}} deactivated.',
    revoked_other: '{{count}} links from {{email}} deactivated.',
    signedOut_one: '{{email}} signed out on {{count}} device.',
    signedOut_other: '{{email}} signed out on {{count}} devices.',
    deleted: 'Account {{email}} deleted.',
    cannotModifySelf: 'You manage your own account on the account page.',
    alreadyVerified: 'The email address is already confirmed.',
    failed: "That didn't work. Please try again.",
  },
  audit: {
    heading: 'Audit log',
    empty: 'No actions yet.',
    account: 'account {{id}}',
    footnote: 'The last 50 actions. Entries are deleted after one year.',
    actions: {
      send_verification_email: 'Confirmation email resent',
      revoke_shares: 'Shared links deactivated',
      sign_out: 'Signed out everywhere',
      delete_user: 'Account deleted',
    },
  },
} satisfies Messages<typeof de>
