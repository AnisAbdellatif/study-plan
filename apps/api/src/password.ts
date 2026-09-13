/**
 * Password hashing with scrypt from node:crypto, which Bun and Node both implement natively,
 * so hashes stay verifiable if the runtime ever changes.
 * Parameters follow the OWASP Password Storage Cheat Sheet option N=2^15, r=8, p=3 (32 MiB per hash),
 * chosen over the 128 MiB option so concurrent logins do not exhaust a small VPS.
 * They are stored in each hash, so they can be raised later without invalidating existing passwords.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const SALT_LENGTH = 16
const CURRENT = { ln: 15, r: 8, p: 3 } as const

interface ScryptParams {
  ln: number
  r: number
  p: number
}

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.ln
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N, r: params.r, p: params.p, maxmem: 256 * N * params.r * params.p },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(password, salt, CURRENT)
  return `$scrypt$ln=${CURRENT.ln},r=${CURRENT.r},p=${CURRENT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

const HASH_FORMAT = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  const match = HASH_FORMAT.exec(hash)
  if (!match) return false
  const params = { ln: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }
  // Bounds keep a corrupted hash from requesting an absurd amount of memory.
  if (params.ln < 10 || params.ln > 20 || params.r < 1 || params.r > 16 || params.p < 1 || params.p > 16)
    return false
  const expected = Buffer.from(match[5] ?? '', 'base64')
  const actual = await derive(password, Buffer.from(match[4] ?? '', 'base64'), params)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
