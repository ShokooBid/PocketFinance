import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import argon2 from "argon2";

// 256 bits of entropy, base64url (43 characters). Used for session tokens.
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

// One adaptive operation also runs for absent, disabled and malformed credentials.
export async function passwordVerifier() {
  const dummyHash = await hashPassword(randomToken());
  return async (hash: string | null | undefined, password: string) => {
    if (!hash?.startsWith("$argon2id$")) {
      await argon2.verify(dummyHash, password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      await argon2.verify(dummyHash, password);
      return false;
    }
  };
}

// Stateless Google sign-in nonce: "<expiry seconds>.<random>.<HMAC>". It binds a
// Google ID token to a short window issued by this server without a table. It
// is not single-use; the window is bounded by CHALLENGE_TTL_SECONDS.
export const nonceFormat = /^\d{1,12}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
const mac = (key: Uint8Array, body: string) =>
  createHmac("sha256", key).update(`google-nonce.${body}`).digest("base64url");

export function signNonce(key: Uint8Array, expiresAt: Date) {
  const body = `${Math.floor(expiresAt.getTime() / 1000)}.${randomBytes(16).toString("base64url")}`;
  return `${body}.${mac(key, body)}`;
}

export function nonceValid(key: Uint8Array, nonce: string, now: Date) {
  if (!nonceFormat.test(nonce)) return false;
  const body = nonce.slice(0, nonce.lastIndexOf("."));
  const expected = Buffer.from(mac(key, body));
  const actual = Buffer.from(nonce.slice(body.length + 1));
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected) &&
    Number(body.slice(0, body.indexOf("."))) * 1000 > now.getTime()
  );
}
