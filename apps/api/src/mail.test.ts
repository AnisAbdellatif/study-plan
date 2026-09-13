import { describe, expect, it } from 'vitest'
import { createSmtpMailer, describeSmtpUrl } from './mail.ts'

describe('describeSmtpUrl', () => {
  it('shows host, port, TLS mode and the decoded login name, never the password', () => {
    const server = describeSmtpUrl('smtps://noreply%40study-plan.de:geheim!@mail.spacemail.com:465')
    expect(server).toEqual({
      host: 'mail.spacemail.com',
      port: 465,
      secure: true,
      username: 'noreply@study-plan.de',
    })
    expect(JSON.stringify(server)).not.toContain('geheim')
  })

  it('fills in the default ports', () => {
    expect(describeSmtpUrl('smtps://u:p@mail.example.org')).toMatchObject({ port: 465, secure: true })
    expect(describeSmtpUrl('smtp://u:p@mail.example.org')).toMatchObject({ port: 587, secure: false })
  })

  it('returns null for something that is not a URL', () => {
    expect(describeSmtpUrl('not a url')).toBeNull()
  })
})

describe('SMTP mailer check', () => {
  it('reports an unreachable server as a failure without throwing or leaking the password', async () => {
    const mailer = createSmtpMailer('smtp://user:very-secret-password@127.0.0.1:1', 'test@example.org')
    const result = await mailer.verify()
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('very-secret-password')
    expect(mailer.status()).toMatchObject({ transport: 'smtp', lastSuccess: null, lastFailure: null })
  })
})
