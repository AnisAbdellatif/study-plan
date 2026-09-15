import nodemailer from 'nodemailer'
import { BRAND_NAME, type EmailBlock, renderEmail } from './mail-layout.ts'

export interface OutgoingMail {
  to: string
  subject: string
  /** Plain-text version; always sent, and used by clients that do not show HTML. */
  text: string
  /** Designed version, see mail-layout.ts. */
  html?: string
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
        html: mail.html,
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

export type MailLocale = 'de' | 'en'

/** The e-mail language of a user record. Anything but a known locale falls back to German. */
export const mailLocale = (recipient: object): MailLocale =>
  'locale' in recipient && recipient.locale === 'en' ? 'en' : 'de'

/** The site the links point to, e.g. https://study-plan.de. The e-mail logo is loaded from there. */
const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

const shared = {
  de: {
    greeting: 'Hallo,',
    fallback: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
    // German compounds with a multi-word name are hyphenated throughout: Study-Plan-Konto.
    accountFooter: `Du bekommst diese E-Mail, weil mit dieser Adresse ein ${BRAND_NAME.replace(/ /g, '-')}-Konto angelegt oder verwendet wurde.`,
  },
  en: {
    greeting: 'Hello,',
    fallback: 'If the button doesn’t work, copy this link into your browser:',
    accountFooter: `You’re receiving this email because this address was used for a ${BRAND_NAME} account.`,
  },
} satisfies Record<MailLocale, Record<string, string>>

/** A short bilingual message to confirm that delivery works end to end. */
export function testMail(to: string, publicUrl: string): OutgoingMail {
  const subject = `${BRAND_NAME}: Test-E-Mail / test email`
  const de =
    'Diese Test-E-Mail wurde aus der Verwaltung von Study Plan verschickt. Der E-Mail-Versand funktioniert.'
  const en = 'This test email was sent from the Study Plan admin dashboard. Email delivery works.'
  return {
    to,
    subject,
    text: [de, '', en].join('\n'),
    html: renderEmail({
      locale: 'de',
      origin: originOf(publicUrl),
      subject,
      preheader: 'Der E-Mail-Versand funktioniert. / Email delivery works.',
      heading: 'Test-E-Mail / Test email',
      blocks: [
        { kind: 'paragraph', text: de },
        { kind: 'paragraph', text: en },
      ],
      footer: [`${BRAND_NAME} · ${originOf(publicUrl).replace(/^https?:\/\//, '')}`],
    }),
  }
}

export interface ContactMessage {
  name?: string | undefined
  email: string
  message: string
  locale: MailLocale
}

/**
 * A contact form message for the operator's mailbox, in plain text only so nothing the sender typed is rendered
 * as HTML. Reply-To is the sender, so answering is a normal reply.
 */
export function contactMail(to: string, contact: ContactMessage, publicUrl: string): OutgoingMail {
  const sender = contact.name ? `${contact.name} <${contact.email}>` : contact.email
  const site = originOf(publicUrl).replace(/^https?:\/\//, '')
  return {
    to,
    subject: `${BRAND_NAME}: Kontaktanfrage von ${contact.name ?? contact.email}`,
    text: [
      `Nachricht über das Kontaktformular auf ${site} (Sprache der Website: ${contact.locale})`,
      `Von: ${sender}`,
      '',
      contact.message,
    ].join('\n'),
    headers: { 'Reply-To': contact.email },
  }
}

const accountMails = {
  de: {
    verificationSubject: 'Bitte bestätige deine E-Mail-Adresse',
    verificationPreheader: 'Ein Klick, dann ist dein Konto aktiv.',
    verificationHeading: 'Bestätige deine E-Mail-Adresse',
    verificationIntro: `bitte bestätige deine E-Mail-Adresse für deinen ${BRAND_NAME.replace(/ /g, '-')}-Account:`,
    verificationButton: 'E-Mail-Adresse bestätigen',
    verificationOutro:
      'Der Link ist eine Stunde gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.',
    resetSubject: 'Passwort zurücksetzen',
    resetPreheader: 'Lege ein neues Passwort fest. Der Link ist eine Stunde gültig.',
    resetHeading: 'Neues Passwort festlegen',
    resetIntro: `über diesen Link kannst du ein neues Passwort für deinen ${BRAND_NAME.replace(/ /g, '-')}-Account festlegen:`,
    resetButton: 'Neues Passwort festlegen',
    resetOutro:
      'Der Link ist eine Stunde gültig und funktioniert nur einmal. Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  en: {
    verificationSubject: 'Please confirm your e-mail address',
    verificationPreheader: 'One click and your account is active.',
    verificationHeading: 'Confirm your email address',
    verificationIntro: `please confirm the e-mail address for your ${BRAND_NAME} account:`,
    verificationButton: 'Confirm email address',
    verificationOutro: 'The link is valid for one hour. If you did not sign up, you can ignore this e-mail.',
    resetSubject: 'Reset your password',
    resetPreheader: 'Set a new password. The link is valid for one hour.',
    resetHeading: 'Set a new password',
    resetIntro: `use this link to set a new password for your ${BRAND_NAME} account:`,
    resetButton: 'Set new password',
    resetOutro:
      'The link is valid for one hour and works only once. If you did not ask for a new password, you can ignore this e-mail.',
  },
} satisfies Record<MailLocale, Record<string, string>>

/** Greeting, intro and one button: the shape of both account e-mails. */
function actionMail(
  to: string,
  url: string,
  locale: MailLocale,
  copy: { subject: string; preheader: string; heading: string; intro: string; button: string; outro: string },
): OutgoingMail {
  const common = shared[locale]
  return {
    to,
    subject: copy.subject,
    text: [common.greeting, '', copy.intro, url, '', copy.outro].join('\n'),
    html: renderEmail({
      locale,
      origin: originOf(url),
      subject: copy.subject,
      preheader: copy.preheader,
      heading: copy.heading,
      blocks: [
        { kind: 'paragraph', text: `${common.greeting} ${copy.intro}` },
        { kind: 'button', label: copy.button, url, fallback: common.fallback },
        { kind: 'note', text: copy.outro },
      ],
      footer: [common.accountFooter],
    }),
  }
}

export const verificationMail = (to: string, url: string, locale: MailLocale = 'de'): OutgoingMail => {
  const text = accountMails[locale]
  return actionMail(to, url, locale, {
    subject: text.verificationSubject,
    preheader: text.verificationPreheader,
    heading: text.verificationHeading,
    intro: text.verificationIntro,
    button: text.verificationButton,
    outro: text.verificationOutro,
  })
}

export const passwordResetMail = (to: string, url: string, locale: MailLocale = 'de'): OutgoingMail => {
  const text = accountMails[locale]
  return actionMail(to, url, locale, {
    subject: text.resetSubject,
    preheader: text.resetPreheader,
    heading: text.resetHeading,
    intro: text.resetIntro,
    button: text.resetButton,
    outro: text.resetOutro,
  })
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
    heading: 'Diese Termine stehen an',
    intro: 'in deinem Studienplan stehen diese Termine an:',
    withdrawal: 'Letzter Tag zur Abmeldung',
    exam: 'Prüfung',
    disclaimer:
      'Die Termine stammen aus deinen eigenen Einträgen. Verbindlich sind die Fristen im Prüfungsportal deiner Hochschule.',
    manage: 'Erinnerungen verwalten',
    unsubscribe: 'Keine Erinnerungen mehr bekommen',
    footer: 'Du bekommst diese Erinnerung, weil du E-Mail-Erinnerungen in deinem Konto eingeschaltet hast.',
  },
  en: {
    subjectWithWithdrawal: 'Reminder: withdrawal deadlines and exams',
    subjectExamsOnly: 'Reminder: upcoming exams',
    heading: 'Coming up',
    intro: 'these dates are coming up in your study plan:',
    withdrawal: 'Last day to withdraw',
    exam: 'Exam',
    disclaimer:
      "These dates come from your own entries. The deadlines in your university's exam portal are binding.",
    manage: 'Manage reminders',
    unsubscribe: 'Stop all reminders',
    footer: 'You’re receiving this reminder because you turned on email reminders in your account.',
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
  const formatted = sorted.map((item) => ({
    ...item,
    label: item.kind === 'withdrawal' ? text.withdrawal : text.exam,
    when: longDates[locale].format(new Date(`${item.date}T00:00:00Z`)),
  }))
  const subject = sorted.some((item) => item.kind === 'withdrawal')
    ? text.subjectWithWithdrawal
    : text.subjectExamsOnly
  const blocks: EmailBlock[] = [
    { kind: 'paragraph', text: `${shared[locale].greeting} ${text.intro}` },
    {
      kind: 'rows',
      rows: formatted.map((item) => ({
        label: item.label,
        tone: item.kind === 'withdrawal' ? 'warning' : 'info',
        title: item.moduleName,
        value: item.when,
      })),
    },
    { kind: 'button', label: text.manage, url: links.settingsUrl, fallback: shared[locale].fallback },
    { kind: 'note', text: text.disclaimer },
  ]
  return {
    to,
    subject,
    text: [
      shared[locale].greeting,
      '',
      text.intro,
      '',
      ...formatted.map((item) => `- ${item.label}: ${item.moduleName}, ${item.when}`),
      '',
      text.disclaimer,
      '',
      `${text.manage}: ${links.settingsUrl}`,
      `${text.unsubscribe}: ${links.unsubscribeUrl}`,
    ].join('\n'),
    html: renderEmail({
      locale,
      origin: originOf(links.settingsUrl),
      subject,
      preheader: formatted.map((item) => `${item.label}: ${item.moduleName}`).join(' · '),
      heading: text.heading,
      blocks,
      footer: [text.footer],
      footerLinks: [
        { label: text.manage, url: links.settingsUrl },
        { label: text.unsubscribe, url: links.unsubscribeUrl },
      ],
    }),
    headers: {
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
