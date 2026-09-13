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

export const verificationMail = (to: string, url: string): OutgoingMail => ({
  to,
  subject: 'Bitte bestätige deine E-Mail-Adresse',
  text: [
    'Hallo,',
    '',
    'bitte bestätige deine E-Mail-Adresse für deinen Studienplaner-Account:',
    url,
    '',
    'Der Link ist eine Stunde gültig. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.',
  ].join('\n'),
})

export const passwordResetMail = (to: string, url: string): OutgoingMail => ({
  to,
  subject: 'Passwort zurücksetzen',
  text: [
    'Hallo,',
    '',
    'über diesen Link kannst du ein neues Passwort für deinen Studienplaner-Account festlegen:',
    url,
    '',
    'Der Link ist eine Stunde gültig. Wenn du kein neues Passwort angefordert hast, kannst du diese E-Mail ignorieren.',
  ].join('\n'),
})

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

const longDate = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Module names and dates only: no grades, no plan contents beyond what the reminder needs. */
export function reminderMail(to: string, items: readonly ReminderItem[], links: ReminderLinks): OutgoingMail {
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.moduleName.localeCompare(b.moduleName),
  )
  return {
    to,
    subject: sorted.some((item) => item.kind === 'withdrawal')
      ? 'Erinnerung: Abmeldefristen und Prüfungen'
      : 'Erinnerung: anstehende Prüfungen',
    text: [
      'Hallo,',
      '',
      'in deinem Studienplan stehen diese Termine an:',
      '',
      ...sorted.map(
        (item) =>
          `- ${item.kind === 'withdrawal' ? 'Letzter Tag zur Abmeldung' : 'Prüfung'}: ${item.moduleName}, ${longDate.format(new Date(`${item.date}T00:00:00Z`))}`,
      ),
      '',
      'Die Termine stammen aus deinen eigenen Einträgen. Verbindlich sind die Fristen im Prüfungsportal deiner Hochschule.',
      '',
      `Erinnerungen verwalten: ${links.settingsUrl}`,
      `Keine Erinnerungen mehr bekommen: ${links.unsubscribeUrl}`,
    ].join('\n'),
    headers: {
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
