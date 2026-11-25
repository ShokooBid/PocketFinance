import { describe, expect, it } from "@jest/globals";
import {
  credentialProblem,
  passwordRuleMet,
  submitFailureMessage
} from "../src/auth-form-data";
import { ClientFailure, failureMessage } from "../src/auth/transport";

const email = "test@example.invalid";

describe("auth form rules", () => {
  it("requires 12–128 nonblank characters only when creating an account", () => {
    expect(credentialProblem("sign-up", email, "x".repeat(11))).not.toBeNull();
    expect(credentialProblem("sign-up", email, "x".repeat(12))).toBeNull();
    expect(credentialProblem("sign-up", email, "x".repeat(129))).not.toBeNull();
    expect(credentialProblem("sign-up", email, " ".repeat(12))).not.toBeNull();
    expect(credentialProblem("sign-in", email, "x")).toBeNull();
    expect(credentialProblem("sign-in", email, "")).not.toBeNull();
  });
  it("rejects malformed email in both modes", () => {
    for (const mode of ["sign-in", "sign-up"] as const)
      expect(
        credentialProblem(mode, "not-email", "x".repeat(12))
      ).not.toBeNull();
  });
  it("tracks the live password rule", () => {
    expect(passwordRuleMet("x".repeat(11))).toBe(false);
    expect(passwordRuleMet("x".repeat(12))).toBe(true);
    expect(passwordRuleMet(" ".repeat(12))).toBe(false);
  });
  it("uses a neutral message only for a refused registration", () => {
    const refused = new ClientFailure("invalid");
    expect(submitFailureMessage("sign-up", refused)).toContain(
      "If you already have one, sign in instead"
    );
    expect(submitFailureMessage("sign-in", refused)).toBe(
      failureMessage(refused)
    );
    const offline = new ClientFailure("network");
    expect(submitFailureMessage("sign-up", offline)).toBe(
      failureMessage(offline)
    );
  });
});
