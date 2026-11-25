import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { signNonce, tokenHash } from "../../src/auth/crypto.js";
import { googleVerifier } from "../../src/auth/google.js";
import { createAuthService } from "../../src/auth/service.js";
import { testConfig } from "../fixtures.js";
import { disposableDatabase } from "../support/disposable.js";

const database = disposableDatabase();
const db = database.db;
const config = testConfig();
let now = new Date();
let app: Awaited<ReturnType<typeof buildApp>>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const password = "synthetic long passphrase 17";
type Tokens = { accessToken: string; tokenType: "Bearer" };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const uniqueEmail = () => `${randomUUID()}@example.invalid`;

beforeAll(async () => {
  await database.start();
  keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  const auth = await createAuthService(
    db,
    config,
    googleVerifier(
      config,
      createLocalJWKSet({ keys: [{ ...jwk, kid: "synthetic", alg: "RS256" }] })
    ),
    () => now
  );
  app = await buildApp(config, auth, { logger: false, rateLimitMax: 10000 });
});
afterAll(async () => {
  try {
    await app?.close();
  } finally {
    await database.close();
  }
});

async function post(url: string, payload?: object, access?: string) {
  return app.inject({
    method: "POST",
    url: `/v1/auth/${url}`,
    ...(payload ? { payload } : {}),
    headers: access ? bearer(access) : {}
  });
}
async function register(email = uniqueEmail()) {
  const response = await post("register", { email, password });
  expect(response.statusCode, response.body).toBe(201);
  return { token: response.json<Tokens>().accessToken, email };
}
async function challenge() {
  const response = await post("google/challenges");
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ nonce: string }>().nonce;
}
async function googleProof(
  nonce: string,
  subject = `synthetic-${randomUUID()}`,
  email = uniqueEmail(),
  extra: Record<string, unknown> = {}
) {
  const idToken = await new SignJWT({
    nonce,
    email,
    email_verified: true,
    azp: "synthetic-native-client",
    ...extra
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
    .setSubject(subject)
    .setIssuer("https://accounts.google.com")
    .setAudience("synthetic-web-client")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 300)
    .sign(keys.privateKey);
  return { nonce, idToken };
}
const me = (token: string) =>
  app.inject({ url: "/v1/me", headers: bearer(token) });
const userId = async (token: string) => (await me(token)).json().id as string;

describe("password sign-in and opaque sessions", () => {
  it("normalizes email, hashes the password and stores only the session token hash", async () => {
    const email = uniqueEmail();
    const { token } = await register(` ${email.toUpperCase()} `);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    expect(user.emailVerifiedAt).toBeNull();
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: tokenHash(token) }
    });
    expect(session).toMatchObject({ userId: user.id });
    expect(JSON.stringify(session)).not.toContain(token);
    expect((await me(token)).json()).toEqual({
      id: user.id,
      email,
      emailVerified: false,
      methods: { password: true, google: false }
    });
    expect(
      (await post("login", { email: ` ${email.toUpperCase()} `, password }))
        .statusCode
    ).toBe(200);
    expect((await post("register", { email, password })).statusCode).toBe(401);
  });
  it("finds legacy mixed-case/space-padded emails on login and blocks duplicates", async () => {
    const { token, email } = await register();
    await db.user.update({
      where: { id: await userId(token) },
      data: { email: ` ${email.toUpperCase()} ` }
    });
    expect((await post("login", { email, password })).statusCode).toBe(200);
    expect((await post("register", { email, password })).statusCode).toBe(401);
  });
  it("returns the same credential error for absent, wrong, null, malformed and disabled credentials", async () => {
    const { email } = await register();
    const nullEmail = uniqueEmail();
    const malformed = uniqueEmail();
    const disabled = uniqueEmail();
    await db.user.createMany({
      data: [
        { email: nullEmail },
        { email: malformed, passwordHash: "$argon2id$malformed" },
        {
          email: disabled,
          passwordHash: "!disabled:synthetic",
          disabledAt: now
        }
      ]
    });
    let expected: unknown;
    for (const candidate of [
      email,
      uniqueEmail(),
      nullEmail,
      malformed,
      disabled
    ]) {
      const response = await post("login", {
        email: candidate,
        password: "incorrect synthetic password"
      });
      expect(response.statusCode).toBe(401);
      const { requestId: _requestId, ...error } = response.json().error;
      expect(_requestId).toBeTruthy();
      expected ??= error;
      expect(error).toEqual(expected);
      expect(response.body).not.toContain(candidate);
    }
  });
  it("rejects missing, malformed, unknown and non-bearer tokens", async () => {
    const { token } = await register();
    expect((await app.inject("/v1/me")).statusCode).toBe(401);
    for (const header of [
      "Bearer invalid.token.signature",
      `Bearer ${"A".repeat(43)}`,
      `Bearer ${token}x`,
      `Basic ${token}`,
      token
    ])
      expect(
        (
          await app.inject({
            url: "/v1/me",
            headers: { authorization: header }
          })
        ).statusCode
      ).toBe(401);
    expect((await me(token)).statusCode).toBe(200);
  });
  it("keeps a session valid until sign-out, even after a year without use", async () => {
    const startedAt = now;
    const { token } = await register();
    try {
      now = new Date(startedAt.getTime() + 400 * 86_400_000);
      expect((await me(token)).statusCode).toBe(200);
    } finally {
      now = startedAt;
    }
  });
  it("logs out the current or all devices by deleting sessions, without affecting another user", async () => {
    const first = await register();
    const second = (
      await post("login", { email: first.email, password })
    ).json<Tokens>().accessToken;
    const other = await register();
    expect((await post("logout", {}, first.token)).statusCode).toBe(200);
    expect((await me(first.token)).statusCode).toBe(401);
    expect(
      await db.session.count({ where: { tokenHash: tokenHash(first.token) } })
    ).toBe(0);
    expect((await me(second)).statusCode).toBe(200);
    const third = (
      await post("login", { email: first.email, password })
    ).json<Tokens>().accessToken;
    const owner = await userId(second);
    expect(
      (await post("logout", { allSessions: true }, second)).statusCode
    ).toBe(200);
    for (const revoked of [second, third])
      expect((await me(revoked)).statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: owner } })).toBe(0);
    expect((await me(other.token)).statusCode).toBe(200);
    expect((await post("logout", {}, second)).statusCode).toBe(401);
  });
  it("rejects every session of a disabled user immediately", async () => {
    const { token, email } = await register();
    await db.user.update({
      where: { id: await userId(token) },
      data: { disabledAt: now }
    });
    expect((await me(token)).statusCode).toBe(401);
    expect((await post("login", { email, password })).statusCode).toBe(401);
  });
  it("authenticates a stored token against a fresh service instance (API restart)", async () => {
    const { token } = await register();
    const restarted = await createAuthService(
      db,
      config,
      googleVerifier(config),
      () => now
    );
    expect((await restarted.authenticate(token)).userId).toBe(
      await userId(token)
    );
  });
  it("no longer serves refresh, linking or reauthentication", async () => {
    const { token } = await register();
    for (const path of ["refresh", "google/link", "reauthenticate"])
      expect((await post(path, {}, token)).statusCode).toBe(404);
  });
  it("serializes concurrent sign-up for the same normalized email", async () => {
    const email = uniqueEmail();
    const results = await Promise.all([
      post("register", { email, password }),
      post("register", { email: email.toUpperCase(), password })
    ]);
    expect(results.map((response) => response.statusCode).sort()).toEqual([
      201, 401
    ]);
  });
});

describe("Google sign-in", () => {
  it("creates a Google-only user and resolves the subject before a changed email", async () => {
    const subject = `synthetic-${randomUUID()}`;
    const email = uniqueEmail();
    const response = await post(
      "google",
      await googleProof(await challenge(), subject, email)
    );
    expect(response.statusCode, response.body).toBe(200);
    const token = response.json<Tokens>().accessToken;
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ passwordHash: null, googleSubject: subject });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await me(token)).json()).toMatchObject({
      id: user.id,
      emailVerified: true,
      methods: { password: false, google: true }
    });
    expect((await post("login", { email, password })).statusCode).toBe(401);
    const changed = await post(
      "google",
      await googleProof(await challenge(), subject, uniqueEmail())
    );
    expect(changed.statusCode).toBe(200);
    expect(await userId(changed.json<Tokens>().accessToken)).toBe(user.id);
    expect((await me(token)).json().email).toBe(email);
  });
  it("rejects forged, expired and mismatched nonces before trusting the proof", async () => {
    const proof = await googleProof(await challenge());
    const forged = signNonce(
      new Uint8Array(32),
      new Date(now.getTime() + 60_000)
    );
    expect((await post("google", await googleProof(forged))).statusCode).toBe(
      401
    );
    expect(
      (await post("google", { ...proof, nonce: await challenge() })).statusCode
    ).toBe(401);
    expect(
      (await post("google", { ...proof, nonce: "x".repeat(43) })).statusCode
    ).toBe(422);
    const original = now;
    try {
      now = new Date(now.getTime() + (config.challengeSeconds + 1) * 1000);
      expect((await post("google", proof)).statusCode).toBe(401);
    } finally {
      now = original;
    }
    expect((await post("google", proof)).statusCode).toBe(200);
  });
  it("rejects invalid provider proof and unverified onboarding email", async () => {
    const nonce = await challenge();
    expect(
      (await post("google", { nonce, idToken: "invalid-token" })).statusCode
    ).toBe(401);
    const email = uniqueEmail();
    expect(
      (
        await post(
          "google",
          await googleProof(await challenge(), undefined, email, {
            email_verified: false
          })
        )
      ).statusCode
    ).toBe(401);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });
  it("never merges a Google identity into an existing password account by email", async () => {
    const { token, email } = await register();
    const subject = `synthetic-${randomUUID()}`;
    expect(
      (
        await post(
          "google",
          await googleProof(await challenge(), subject, email.toUpperCase())
        )
      ).statusCode
    ).toBe(401);
    expect(await db.user.count({ where: { googleSubject: subject } })).toBe(0);
    expect((await me(token)).json().methods).toEqual({
      password: true,
      google: false
    });
  });
  it("creates exactly one user for concurrent first sign-ins with the same subject", async () => {
    const subject = `synthetic-${randomUUID()}`;
    const email = uniqueEmail();
    const proofs = await Promise.all([
      googleProof(await challenge(), subject, email),
      googleProof(await challenge(), subject, email)
    ]);
    const results = await Promise.all(
      proofs.map((proof) => post("google", proof))
    );
    expect(
      results.every((response) => [200, 401].includes(response.statusCode))
    ).toBe(true);
    expect(await db.user.count({ where: { googleSubject: subject } })).toBe(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
  it("rejects disabled Google users, even with a verified proof", async () => {
    const subject = `synthetic-${randomUUID()}`;
    const login = await post(
      "google",
      await googleProof(await challenge(), subject)
    );
    await db.user.update({
      where: { id: await userId(login.json<Tokens>().accessToken) },
      data: { disabledAt: now }
    });
    expect(
      (await post("google", await googleProof(await challenge(), subject)))
        .statusCode
    ).toBe(401);
  });
  it("refuses Google challenges when Google is not configured", async () => {
    const auth = await createAuthService(
      db,
      { ...config, googleAudiences: [] },
      googleVerifier(config)
    );
    expect(() => auth.challenge()).toThrow();
  });
});
