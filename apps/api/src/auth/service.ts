import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { Config } from "../config.js";
import { invalidCredentials } from "../errors.js";
import {
  hashPassword,
  nonceValid,
  passwordVerifier,
  randomToken,
  signNonce,
  tokenHash
} from "./crypto.js";
import type { GoogleVerifier } from "./google.js";

type Transaction = Prisma.TransactionClient;
export type Principal = { userId: string; sessionId: string };
export type GoogleInput = { nonce: string; idToken: string };
// Opaque session tokens are randomToken() output: 43 base64url characters.
const sessionToken = /^[A-Za-z0-9_-]{43}$/;
const addSeconds = (now: Date, seconds: number) =>
  new Date(now.getTime() + seconds * 1000);
const uniqueFailure = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "P2002";

// A session is one signed-in device. It stays valid until logout, logout on
// all devices, or the user being disabled; there is no refresh or expiry.
export async function createAuthService(
  db: PrismaClient,
  config: Config,
  google: GoogleVerifier,
  clock = () => new Date()
) {
  const verifyPassword = await passwordVerifier();

  async function findEmail(email: string) {
    const matches = await db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "User" WHERE lower(btrim(email)) = ${email.trim().toLowerCase()}`;
    return matches[0]
      ? db.user.findUnique({ where: { id: matches[0].id } })
      : null;
  }

  async function issue(tx: Transaction, userId: string) {
    // Lock the user: session creation, disable checks and logout-all serialize here.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.disabledAt) throw invalidCredentials();
    const token = randomToken();
    await tx.session.create({
      data: { userId, tokenHash: tokenHash(token), createdAt: clock() }
    });
    return { accessToken: token, tokenType: "Bearer" as const };
  }

  async function authenticate(token: string): Promise<Principal> {
    if (!sessionToken.test(token)) throw invalidCredentials();
    const session = await db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: { select: { disabledAt: true } } }
    });
    if (!session || session.user.disabledAt) throw invalidCredentials();
    return { userId: session.userId, sessionId: session.id };
  }

  function challenge() {
    if (!config.googleAudiences.length) throw invalidCredentials();
    const expiresAt = addSeconds(clock(), config.challengeSeconds);
    return {
      nonce: signNonce(config.nonceKey, expiresAt),
      expiresAt: expiresAt.toISOString()
    };
  }

  async function register(email: string, password: string) {
    const hash = await hashPassword(password);
    if (await findEmail(email)) throw invalidCredentials();
    try {
      return await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: email.trim().toLowerCase(), passwordHash: hash }
        });
        return issue(tx, user.id);
      });
    } catch (error) {
      if (uniqueFailure(error)) throw invalidCredentials();
      throw error;
    }
  }

  async function login(email: string, password: string) {
    const user = await findEmail(email);
    const valid = await verifyPassword(
      user?.disabledAt ? null : user?.passwordHash,
      password
    );
    if (!valid || !user || user.disabledAt) throw invalidCredentials();
    return db.$transaction((tx) => issue(tx, user.id));
  }

  async function googleLogin(input: GoogleInput) {
    // Reject forged or expired nonces before any provider I/O.
    if (!nonceValid(config.nonceKey, input.nonce, clock()))
      throw invalidCredentials();
    const proof = await google(input.idToken, input.nonce, clock());
    // Resolve by verified subject first, so a changed Google email still works.
    const existing = await db.user.findUnique({
      where: { googleSubject: proof.subject }
    });
    if (existing) return db.$transaction((tx) => issue(tx, existing.id));
    // Never merge by email: a matching password account must sign in with it.
    if (!proof.email || !proof.verifiedEmail || (await findEmail(proof.email)))
      throw invalidCredentials();
    try {
      return await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: proof.email!,
            emailVerifiedAt: clock(),
            googleSubject: proof.subject
          }
        });
        return issue(tx, user.id);
      });
    } catch (error) {
      if (uniqueFailure(error)) throw invalidCredentials();
      throw error;
    }
  }

  async function logout(principal: Principal, all = false) {
    await db.session.deleteMany({
      where: {
        userId: principal.userId,
        ...(all ? {} : { id: principal.sessionId })
      }
    });
  }

  async function currentUser(principal: Principal) {
    const user = await db.user.findUnique({ where: { id: principal.userId } });
    if (!user) throw invalidCredentials();
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      methods: {
        password: user.passwordHash?.startsWith("$argon2id$") ?? false,
        google: user.googleSubject !== null
      }
    };
  }

  return {
    register,
    login,
    googleLogin,
    authenticate,
    challenge,
    logout,
    currentUser
  };
}

export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
