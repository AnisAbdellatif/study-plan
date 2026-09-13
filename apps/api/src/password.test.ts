import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.ts'

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('korrekt-pferd-batterie')
    expect(hash).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/)
    expect(await verifyPassword({ hash, password: 'korrekt-pferd-batterie' })).toBe(true)
    expect(await verifyPassword({ hash, password: 'korrekt-pferd-batteri' })).toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashPassword('gleiches-passwort')).not.toBe(await hashPassword('gleiches-passwort'))
  })

  it('treats canonically equivalent Unicode input as the same password', async () => {
    const composed = 'Prüfungsamt-2026'
    const decomposed = 'Prüfungsamt-2026'
    const hash = await hashPassword(composed)
    expect(await verifyPassword({ hash, password: decomposed })).toBe(true)
  })

  it('rejects malformed or out-of-bounds hashes without throwing', async () => {
    expect(await verifyPassword({ hash: 'not-a-hash', password: 'x' })).toBe(false)
    expect(await verifyPassword({ hash: '$scrypt$ln=40,r=8,p=3$AAAA$AAAA', password: 'x' })).toBe(false)
  })
})
