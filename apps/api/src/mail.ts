import nodemailer from 'nodemailer'

export interface OutgoingMail {
  to: string
  subject: string
  text: string
  headers?: Record<string, string>
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>
}

export interface MailDelivery {
  at: string
  error?: string
}

/** What the admin dashboard shows about mail delivery. Counts since the process started; no addresses. */
export interface MailStatus {
  transport: 'smtp' | 'console' | 'memory'
  from: string
  server: { host: string; port: number; secure: boolean; username: string | null } | null
  lastSuccess: MailDelivery | null
  lastFailure: MailDelivery | null
}

export type MailCheck = { ok: true; durationMs: number } | { ok: false; error: string }

/** A mailer that remembers how its last deliveries went and can test its connection. */
export interface MonitoredMailer extends Mailer {
  status(): MailStatus
  /** Connects and logs in without sending anything. Never throws. */
  verify(): Promise<MailCheck>
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

function monitored(
  base: Omit<MailStatus, 'lastSuccess' | 'lastFailure'>,
  deliver: (mail: OutgoingMail) => Promise<void>,
  check: () => Promise<void>,
  /** Removes secrets from error messages before they are stored, logged or shown. */
  redact: (message: string) => string = (message) => message,
): MonitoredMailer {
  let lastSuccess: MailDelivery | null = null
  let lastFailure: MailDelivery | null = null
  return {
    async send(mail) {
      try {
        await deliver(mail)
        lastSuccess = { at: new Date().toISOString() }
      } catch (error) {
        const message = redact(errorMessage(error))
        lastFailure = { at: new Date().toISOString(), error: message }
        // No recipient in the log: the dashboard and this line are enough to diagnose the server side.
        console.error(`[mail] delivery failed: ${message}`)
        throw new Error(message)
      }
    },
    status: () => ({ ...base, lastSuccess, lastFailure }),
    async verify() {
      const started = performance.now()
      try {
        await check()
        return { ok: true, durationMs: Math.round(performance.now() - started) }
      } catch (error) {
        return { ok: false, error: redact(errorMessage(error)) }
      }
    },
  }
}

/** Host, port, TLS mode and login name of an SMTP URL, for display. Never the password. */
export function describeSmtpUrl(url: string): NonNullable<MailStatus['server']> | null {
  try {
    const parsed = new URL(url)
    const secure = parsed.protocol === 'smtps:'
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
      secure,
      username: parsed.username ? decodeURIComponent(parsed.username) : null,
    }
  } catch {
    return null
  }
}

export function createSmtpMailer(url: string, from: string): MonitoredMailer {
  // Short timeouts, so an unreachable server fails a sign-up or a dashboard check quickly instead of after minutes.
  const transport = nodemailer.createTransport({
    url,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  let password = ''
  try {
    password = decodeURIComponent(new URL(url).password)
  } catch {
    // An unparsable URL fails on the first delivery; there is no password to hide.
  }
  const redact = (message: string) => (password ? message.split(password).join('***') : message)
  return monitored(
    { transport: 'smtp', from, server: describeSmtpUrl(url) },
    async (mail) => {
      await transport.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        headers: mail.headers,
      })
    },
    async () => {
      await transport.verify()
    },
    redact,
  )
}

/** Development only: prints e-mails, including their links, to the console. */
export function createConsoleMailer(): MonitoredMailer {
  return monitored(
    { transport: 'console', from: 'console', server: null },
    async (mail) => {
      console.info(`[mail] An: ${mail.to}\n[mail] Betreff: ${mail.subject}\n\n${mail.text}\n`)
    },
    async () => {},
  )
}

/** Tests: keeps sent mails; set `failWith` to make deliveries and checks fail with that message. */
export function createMemoryMailer(): MonitoredMailer & { sent: OutgoingMail[]; failWith: string | null } {
  const sent: OutgoingMail[] = []
  // The closures read failWith from the returned object, so tests can switch it at any time.
  const result: MonitoredMailer & { sent: OutgoingMail[]; failWith: string | null } = Object.assign(
    monitored(
      { transport: 'memory', from: 'test@example.org', server: null },
      async (mail) => {
        if (result.failWith) throw new Error(result.failWith)
        sent.push(mail)
      },
      async () => {
        if (result.failWith) throw new Error(result.failWith)
      },
    ),
    { sent, failWith: null as string | null },
  )
  return result
}

/** A short bilingual message to confirm that delivery works end to end. */
export function testMail(to: string): OutgoingMail {
  return {
    to,
    subject: 'Studienplaner: Test-E-Mail / test email',
    text: [
      'Diese Test-E-Mail wurde aus der Verwaltung des Studienplaners verschickt. Der E-Mail-Versand funktioniert.',
      '',
      'This test email was sent from the Study Planner admin dashboard. Email delivery works.',
    ].join('\n'),
  }
}

export type MailLocale = 'de' | 'en'

/** The e-mail language of a user record. Anything but a known locale falls back to German. */
export const mailLocale = (recipient: object): MailLocale =>
  'locale' in recipient && recipient.locale === 'en' ? 'en' : 'de'

const accountMails = {
  de: {
    greeting: 'Hallo,',
    verificationSubject: 'Bitte bestätige deine E-Mail-Adresse',
    verificationIntro: 'bitte bestätige deine E-Mail-Adresse für deinen Studienplaner-Account:',
    verificationOutro:
      'Der Link ist eine Stunde gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.',
    resetSubject: 'Passwort zurücksetzen',
    resetIntro: 'über diesen Link kannst du ein neues Passwort für deinen Studienplaner-Account festlegen:',
    resetOutro:
      'Der Link ist eine Stunde gültig. Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  en: {
    greeting: 'Hello,',
    verificationSubject: 'Please confirm your e-mail address',
    verificationIntro: 'please confirm the e-mail address for your Study Planner account:',
    verificationOutro: 'The link is valid for one hour. If you did not sign up, you can ignore this e-mail.',
    resetSubject: 'Reset your password',
    resetIntro: 'use this link to set a new password for your Study Planner account:',
    resetOutro:
      'The link is valid for one hour. If you did not ask for a new password, you can ignore this e-mail.',
  },
} satisfies Record<MailLocale, Record<string, string>>

export const verificationMail = (to: string, url: string, locale: MailLocale = 'de'): OutgoingMail => {
  const text = accountMails[locale]
  return {
    to,
    subject: text.verificationSubject,
    text: [text.greeting, '', text.verificationIntro, url, '', text.verificationOutro].join('\n'),
  }
}

export const passwordResetMail = (to: string, url: string, locale: MailLocale = 'de'): OutgoingMail => {
  const text = accountMails[locale]
  return {
    to,
    subject: text.resetSubject,
    text: [text.greeting, '', text.resetIntro, url, '', text.resetOutro].join('\n'),
  }
}

export interface ReminderItem {
  kind: 'withdrawal' | 'exam'
  moduleName: string
  /** YYYY-MM-DD */
  date: string
}

export interface ReminderLinks {
  settingsUrl: string
  /** Page that asks before turning reminders off, so link scanners cannot unsubscribe anyone. */
  unsubscribeUrl: string
  /** RFC 8058 one-click endpoint for mail clients. */
  oneClickUrl: string
}

const reminderMails = {
  de: {
    subjectWithWithdrawal: 'Erinnerung: Abmeldefristen und Prüfungen',
    subjectExamsOnly: 'Erinnerung: anstehende Prüfungen',
    greeting: 'Hallo,',
    intro: 'in deinem Studienplan stehen diese Termine an:',
    withdrawal: 'Letzter Tag zur Abmeldung',
    exam: 'Prüfung',
    disclaimer:
      'Die Termine stammen aus deinen eigenen Einträgen. Verbindlich sind die Fristen im Prüfungsportal deiner Hochschule.',
    manage: 'Erinnerungen verwalten',
    unsubscribe: 'Keine Erinnerungen mehr bekommen',
  },
  en: {
    subjectWithWithdrawal: 'Reminder: withdrawal deadlines and exams',
    subjectExamsOnly: 'Reminder: upcoming exams',
    greeting: 'Hello,',
    intro: 'these dates are coming up in your study plan:',
    withdrawal: 'Last day to withdraw',
    exam: 'Exam',
    disclaimer:
      "These dates come from your own entries. The deadlines in your university's exam portal are binding.",
    manage: 'Manage reminders',
    unsubscribe: 'Stop all reminders',
  },
} satisfies Record<MailLocale, Record<string, string>>

const longDates: Record<MailLocale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  en: new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
}

/** Module names and dates only: no grades, no plan contents beyond what the reminder needs. */
export function reminderMail(
  to: string,
  items: readonly ReminderItem[],
  links: ReminderLinks,
  locale: MailLocale = 'de',
): OutgoingMail {
  const text = reminderMails[locale]
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.moduleName.localeCompare(b.moduleName),
  )
  return {
    to,
    subject: sorted.some((item) => item.kind === 'withdrawal')
      ? text.subjectWithWithdrawal
      : text.subjectExamsOnly,
    text: [
      text.greeting,
      '',
      text.intro,
      '',
      ...sorted.map(
        (item) =>
          `- ${item.kind === 'withdrawal' ? text.withdrawal : text.exam}: ${item.moduleName}, ${longDates[locale].format(new Date(`${item.date}T00:00:00Z`))}`,
      ),
      '',
      text.disclaimer,
      '',
      `${text.manage}: ${links.settingsUrl}`,
      `${text.unsubscribe}: ${links.unsubscribeUrl}`,
    ].join('\n'),
    headers: {
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
