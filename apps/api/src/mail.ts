import nodemailer from 'nodemailer'

export interface OutgoingMail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>
}

export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url)
  return {
    async send(mail) {
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text })
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
