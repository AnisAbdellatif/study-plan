import type { auth as de } from '../de/auth.ts'
import type { Messages } from '../types.ts'

export const auth = {
  errors: {
    passwordTooShort: 'Your password needs at least {{min}} characters.',
    userExists: 'There is already an account with this email address. Sign in or reset your password.',
    invalidToken: 'This link is invalid or has expired. Request a new one.',
    invalidCredentials: 'The email address or password is wrong.',
    emailNotVerified: 'Please confirm your email address first, using the link we sent you.',
    tooManyAttempts: 'Too many attempts. Please wait a minute and try again.',
    generic: 'That didn’t work. Please try again later.',
    passwordsDiffer: 'The two passwords don’t match.',
    wrongPassword: 'The password is wrong.',
  },
  fields: {
    email: 'Email address',
    password: 'Password',
  },
  signIn: {
    title: 'Sign in',
    intro: 'With an account, your plan is available on all your devices, not just in this browser.',
    verificationResent: 'We’ve sent you a new confirmation email.',
    resendVerification: 'Resend confirmation email',
    submit: 'Sign in',
    pending: 'Signing in…',
    forgotPassword: 'Forgot your password?',
    noAccount: 'No account yet? Sign up',
  },
  signUp: {
    title: 'Create an account',
    intro:
      'Afterwards you can save the plan from this browser to your account. All we need is your email address and a password.',
    passwordHint:
      'At least {{min}} characters. A long sentence is easier to remember than a short, complicated password.',
    privacy: 'Our <privacyLink>privacy policy</privacyLink> explains which data we store.',
    submit: 'Create account',
    pending: 'Creating account…',
    haveAccount: 'Already have an account? Sign in',
    checkTitle: 'Confirm your email address',
    checkText:
      'We’ve sent an email to <strong>{{email}}</strong>. Open the link in it to activate your account and sign in. The link is valid for one hour.',
    resent: 'We’ve sent you the email again.',
    resend: 'Resend email',
  },
  forgotPassword: {
    title: 'Forgot your password',
    sent: 'If there is an account with this address, we’ve sent you a link to reset your password. It is valid for one hour.',
    submit: 'Request link',
    back: 'Back to sign in',
  },
  resetPassword: {
    invalidTitle: 'Invalid link',
    requestNew: 'Request a new link',
    title: 'Set a new password',
    done: 'Your password has been changed. You’ve been signed out everywhere else.',
    signInNow: 'Sign in now',
    newPassword: 'New password',
    repeatPassword: 'Repeat password',
    submit: 'Save password',
  },
  reminders: {
    title: 'Email reminders',
    intro:
      'We email you 3 days before the withdrawal deadline and 7 days before an exam, based on the exam dates in the plans saved to your account. The emails only contain module names and dates.',
    error: 'The setting couldn’t be loaded or saved. Please try again later.',
    label: 'Remind me of withdrawal deadlines and exams',
  },
  unsubscribe: {
    title: 'Turn off email reminders',
    incomplete:
      'This link is incomplete. Open it straight from the email, or turn off reminders in your account.',
    done: 'Reminders are turned off. You can turn them back on any time on your account page.',
    invalid: 'This link is invalid or has expired. You can turn off reminders in your account.',
    explanation: 'You won’t get any more reminders about withdrawal deadlines and exams.',
    submit: 'Turn off reminders',
    toAccount: 'Go to your account',
  },
  account: {
    loadingTitle: 'Account',
    title: 'Your account',
    verified: 'Your email address is confirmed. Welcome!',
    adminLink: 'Go to the admin dashboard',
    password: {
      title: 'Change password',
      intro:
        'For security, you change your password through a link we email you. It is valid for one hour and works only once.',
      submit: 'Send change link',
      pending: 'Sending…',
      resend: 'Send link again',
      sent: 'We’ve sent a link to <strong>{{email}}</strong>. After changing your password you’ll be signed out on all devices and sign in again with the new password.',
    },
    plan: {
      title: 'Plan',
      signedInAs: 'Signed in as <strong>{{email}}</strong>.',
      upload: 'Save plan to account',
      retry: 'Try again',
      open: 'Go to your plan',
      create: 'Create a plan',
    },
    data: {
      title: 'Your data',
      intro:
        'Download everything stored in your account: your email address, plans with grades, and active sign-ins.',
      exportError: 'The download didn’t work. Please try again.',
      exportFilename: 'study-planner-data.json',
      download: 'Download data (JSON)',
      signOut: 'Sign out',
    },
    delete: {
      title: 'Delete account',
      intro:
        'Permanently deletes your account and all plans in it from the server. The plan in this browser stays until you delete it yourself.',
      passwordLabel: 'Password to confirm',
      submit: 'Delete account…',
      confirmTitle: 'Delete your account for good?',
      confirmDescription:
        'Your account and all plans saved to it will be deleted right away. This can’t be undone.',
      confirm: 'Delete for good',
      superadmin:
        'This is the superadmin account. It can’t be deleted, so the platform always has someone in charge.',
    },
  },
  button: {
    signIn: 'Sign in',
    account: 'Account',
    manageAccount: 'Manage account',
    signOut: 'Sign out',
  },
  sync: {
    browserOnly: 'Only saved in this browser',
    connecting: 'Connecting to your account…',
    notInAccount: 'Not saved to your account yet',
    choose: 'Choose a plan',
    saving: 'Saving…',
    synced: 'Saved to your account, {{time}}',
    failed: 'Saving to your account failed',
    choosePlan: {
      title: 'Which plan do you want to keep?',
      description:
        'Your account has “{{remote}}”, last saved on {{time}}. This browser has “{{local}}”. The other plan will be replaced.',
      fallbackName: 'a plan',
      keepBrowser: 'Keep the plan from this browser',
      loadAccount: 'Load the plan from your account',
    },
    banner: {
      uploadText: 'Save your plan to your account to have it on all your devices.',
      upload: 'Save to account',
      errorText: 'Your plan couldn’t be saved to your account just now. Your changes stay in this browser.',
      retry: 'Try again',
      remoteNewerText:
        'Your plan was changed on another device in the meantime. The newer version from your account is loaded, so your last change here wasn’t kept.',
      dismiss: 'Got it',
    },
  },
} satisfies Messages<typeof de>
