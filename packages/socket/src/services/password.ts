import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto"

const SALT_BYTES = 16
const KEY_LENGTH = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const
const HASH_PREFIX = "scrypt"

const deriveKey = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_PARAMS,
      (err, derived) => {
        if (err) {
          reject(err)

          return
        }

        resolve(derived)
      },
    )
  })

// Future hardening note: HIBP k-anonymity breach checks and institutional OIDC/SSO can be layered here.
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_BYTES)
  const derived = await deriveKey(password, salt)

  return `${HASH_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`
}

export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const parts = storedHash.split("$")

  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false
  }

  try {
    const salt = Buffer.from(parts[1], "hex")
    const expected = Buffer.from(parts[2], "hex")

    if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) {
      return false
    }

    const actual = await deriveKey(password, salt)

    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export const constantTimeStringEquals = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "utf-8")
  const bufB = Buffer.from(b, "utf-8")

  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA)

    return false
  }

  return timingSafeEqual(bufA, bufB)
}
