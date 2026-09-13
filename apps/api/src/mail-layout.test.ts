import { describe, expect, it } from 'vitest'
import { passwordResetMail, reminderMail, testMail, verificationMail } from './mail.ts'
import { escapeHtml, renderEmail } from './mail-layout.ts'

describe('e-mail layout', () => {
  it('escapes every text and URL it is given', () => {
    const html = renderEmail({
      locale: 'de',
      origin: 'https://study-plan.de',
      subject: 'Betreff <script>',
      preheader: 'Vorschau & mehr',
      heading: 'Überschrift "zitiert"',
      blocks: [
        { kind: 'paragraph', text: '<img src=x onerror=alert(1)>' },
        { kind: 'button', label: 'Los', url: 'https://study-plan.de/x?a=1&b="2"', fallback: 'Link:' },
      ],
      footer: ['Fuß'],
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('href="https://study-plan.de/x?a=1&amp;b=&quot;2&quot;"')
    expect(escapeHtml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;')
  })
})

describe('account e-mails', () => {
  it('sends the verification link as a button, with the logo from the site and a plain-text version', () => {
    const url = 'https://study-plan.de/api/auth/verify-email?token=abc&callbackURL=%2Faccount'
    const mail = verificationMail('studi@example.org', url, 'de')
    expect(mail.text).toContain(url)
    expect(mail.html).toContain('<html lang="de"')
    expect(mail.html).toContain('src="https://study-plan.de/email-logo.png"')
    expect(mail.html).toContain('>E-Mail-Adresse bestätigen</a>')
    expect(mail.html).toContain(`href="${url.replace(/&/g, '&amp;')}"`)
    expect(mail.html).toContain('Study Plan')
  })

  it('writes the password reset e-mail in English when asked', () => {
    const mail = passwordResetMail('student@example.org', 'https://study-plan.de/reset-password/xyz', 'en')
    expect(mail.subject).toBe('Reset your password')
    expect(mail.html).toContain('<html lang="en"')
    expect(mail.html).toContain('>Set new password</a>')
    expect(mail.html).toContain('works only once')
  })

  it('lists reminder dates as rows, escapes module names and keeps both footer links', () => {
    const mail = reminderMail(
      'studi@example.org',
      [
        { kind: 'exam', moduleName: 'Analysis <I>', date: '2027-02-15' },
        { kind: 'withdrawal', moduleName: 'Lineare Algebra', date: '2027-02-08' },
      ],
      {
        settingsUrl: 'https://study-plan.de/account',
        unsubscribeUrl: 'https://study-plan.de/unsubscribe?token=t',
        oneClickUrl: 'https://study-plan.de/api/notifications/unsubscribe?token=t',
      },
      'de',
    )
    expect(mail.html).toContain('Analysis &lt;I&gt;')
    expect(mail.html).not.toContain('Analysis <I>')
    expect(mail.html?.indexOf('Lineare Algebra')).toBeLessThan(mail.html?.indexOf('Analysis') ?? 0)
    expect(mail.html).toContain('Letzter Tag zur Abmeldung')
    expect(mail.html).toContain('href="https://study-plan.de/unsubscribe?token=t"')
    expect(mail.text).toContain('- Prüfung: Analysis <I>, Mo., 15. Februar 2027')
    expect(mail.headers?.['List-Unsubscribe']).toBe(
      '<https://study-plan.de/api/notifications/unsubscribe?token=t>',
    )
  })

  it('designs the admin test e-mail too', () => {
    const mail = testMail('admin@example.org', 'https://study-plan.de')
    expect(mail.html).toContain('src="https://study-plan.de/email-logo.png"')
    expect(mail.html).toContain('Email delivery works.')
  })
})
