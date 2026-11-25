import { describe, expect, it } from "vitest";
import {
  nonceFormat,
  nonceValid,
  randomToken,
  signNonce,
  tokenHash
} from "../src/auth/crypto.js";
import { testConfig } from "./fixtures.js";

describe("session tokens", () => {
  it("are 256-bit base64url values stored only as a SHA-256 hex digest", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
    expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(token)).not.toContain(token);
  });
});

describe("stateless Google nonces", () => {
  const { nonceKey } = testConfig();
  const now = new Date("2026-11-25T12:00:00Z");
  const expiry = new Date(now.getTime() + 300_000);

  it("accepts an unexpired nonce signed by this server and rejects it at expiry", () => {
    const nonce = signNonce(nonceKey, expiry);
    expect(nonce).toMatch(nonceFormat);
    expect(signNonce(nonceKey, expiry)).not.toBe(nonce);
    expect(nonceValid(nonceKey, nonce, now)).toBe(true);
    expect(nonceValid(nonceKey, nonce, expiry)).toBe(false);
  });

  it("rejects another key, a tampered expiry or MAC, and malformed input", () => {
    const nonce = signNonce(nonceKey, expiry);
    const [, random, signature] = nonce.split(".");
    const later = Math.floor(expiry.getTime() / 1000) + 3600;
    for (const forged of [
      `${later}.${random}.${signature}`,
      `${nonce.slice(0, -1)}${nonce.endsWith("A") ? "B" : "A"}`,
      "x".repeat(43),
      "",
      `${nonce}.extra`
    ])
      expect(nonceValid(nonceKey, forged, now)).toBe(false);
    expect(nonceValid(new Uint8Array(32), nonce, now)).toBe(false);
  });
});
