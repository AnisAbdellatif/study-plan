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

export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url)
  return {
    async send(mail) {
      await transport.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        headers: mail.headers,
      })
    },
  }
}

/** Development only: prints e-mails, including their links, to the console. */
export function createConsoleMailer(): Mailer {
  return {
    async send(mail) {
      console.info(`[mail] An: ${mail.to}\n[mail] Betreff: ${mail.subject}\n\n${mail.text}\n`)
    },
  }
}

export function createMemoryMailer(): Mailer & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = []
  return {
    sent,
    async send(mail) {
      sent.push(mail)
    },
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
