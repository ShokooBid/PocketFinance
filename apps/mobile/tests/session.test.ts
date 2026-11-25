import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { userSchema } from "../src/auth/contracts";
import { createSessionController } from "../src/auth/session-controller";
import {
  alice,
  bob,
  credentials,
  deferred,
  harness,
  response,
  stored
} from "./auth-fixtures";

describe("verified mobile sessions", () => {
  it("keeps navigation pending until the stored session is verified", async () => {
    const h = harness();
    const pending = deferred<Response>();
    h.fetcher.mockReturnValueOnce(pending.promise);
    const restore = h.controller.restore();
    expect(h.controller.getSnapshot()).toEqual({ status: "restoring" });
    pending.resolve(response(alice));
    await restore;
    expect(h.controller.getSnapshot()).toMatchObject({
      status: "authenticated",
      user: alice
    });
    expect(h.fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer synthetic-access"
    });
    expect(h.store.clear).not.toHaveBeenCalled();
  });
  it("restores the same device token after an app restart without renewing it", async () => {
    const h = harness();
    await h.controller.restore();
    const restarted = createSessionController(h.store, h.transport, h.proof);
    await restarted.restore();
    expect(restarted.getSnapshot()).toMatchObject({
      status: "authenticated",
      user: alice
    });
    expect(h.disk()).toEqual(stored());
    expect(h.store.write).not.toHaveBeenCalled();
    expect(
      h.fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)
    ).toEqual(["/v1/me", "/v1/me"]);
  });
  it("returns to sign-in locally when no credentials are stored", async () => {
    const h = harness(null);
    await h.controller.restore();
    expect(h.controller.getSnapshot().status).toBe("signed-out");
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it("clears stored credentials when the server rejects a restore", async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(response({}, 401));
    await h.controller.restore();
    expect(h.controller.getSnapshot()).toMatchObject({
      status: "signed-out",
      notice: expect.stringContaining("session ended")
    });
    expect(h.disk()).toBeNull();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it("signs out on a revoked token and rejects requests from the old client", async () => {
    const h = harness();
    await h.controller.restore();
    const client = h.client();
    h.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      client.send("GET", "/v1/me", userSchema)
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(h.controller.getSnapshot().status).toBe("signed-out");
    expect(h.disk()).toBeNull();
    const calls = h.fetcher.mock.calls.length;
    await expect(
      client.send("GET", "/v1/me", userSchema)
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(h.fetcher).toHaveBeenCalledTimes(calls);
  });
  it("never retries a request after a 401", async () => {
    const h = harness();
    await h.controller.restore();
    h.fetcher.mockClear();
    h.fetcher.mockResolvedValue(response({}, 401));
    await expect(
      h.client().send("POST", "/v1/categories", z.unknown(), { name: "Food" })
    ).rejects.toBeDefined();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves credentials for transient restore failures and permits a retry", async () => {
    const h = harness();
    h.fetcher.mockRejectedValueOnce(new Error("private network diagnostic"));
    await h.controller.restore();
    expect(h.controller.getSnapshot()).toEqual({
      status: "unavailable",
      reason: "network"
    });
    expect(h.disk()).toEqual(stored());
    await h.controller.restore();
    expect(h.controller.getSnapshot().status).toBe("authenticated");
  });
  it("keeps credentials on server errors and rate limits during a request", async () => {
    for (const status of [429, 503]) {
      const h = harness();
      await h.controller.restore();
      h.fetcher.mockResolvedValueOnce(response({}, status));
      await expect(
        h.client().send("GET", "/v1/me", userSchema)
      ).rejects.toBeDefined();
      expect(h.controller.getSnapshot().status).toBe("authenticated");
      expect(h.disk()).toEqual(stored());
    }
  });
  it("reports storage failure when a stored session cannot be read", async () => {
    const h = harness();
    h.store.read.mockRejectedValueOnce(new Error("locked secure store"));
    await h.controller.restore();
    expect(h.controller.getSnapshot()).toEqual({
      status: "unavailable",
      reason: "storage"
    });
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it("revokes on logout and clears credentials, even offline", async () => {
    for (const offline of [false, true]) {
      const h = harness();
      await h.controller.restore();
      if (offline) h.fetcher.mockRejectedValueOnce(new Error("offline"));
      else h.fetcher.mockResolvedValueOnce(response({ ok: true }));
      await h.controller.logout();
      expect(h.disk()).toBeNull();
      expect(h.fetcher.mock.calls.at(-1)?.[0]).toBe(
        "https://api.example.invalid/v1/auth/logout"
      );
      expect(h.controller.getSnapshot()).toMatchObject({
        status: "signed-out",
        notice: expect.stringContaining(
          offline ? "could not be confirmed" : "Signed out."
        )
      });
    }
  });
  it("carries all-device scope to the server and reports an already-revoked token honestly", async () => {
    for (const outcome of ["ok", "revoked"] as const) {
      const h = harness();
      await h.controller.restore();
      h.fetcher.mockClear();
      h.fetcher.mockResolvedValueOnce(
        outcome === "ok" ? response({ ok: true }) : response({}, 401)
      );
      await h.controller.logout(true);
      expect(h.disk()).toBeNull();
      expect(h.fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(h.fetcher.mock.calls[0]?.[1]?.body))).toEqual({
        allSessions: true
      });
      expect(h.controller.getSnapshot()).toMatchObject({
        status: "signed-out",
        notice: expect.stringContaining(
          outcome === "ok"
            ? "Signed out on all devices."
            : "could not be confirmed"
        )
      });
    }
  });
  it("discards stale responses after logout and account switch", async () => {
    const h = harness();
    await h.controller.restore();
    const oldClient = h.client();
    const pending = deferred<Response>();
    h.fetcher
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(response({ ok: true }));
    const result = oldClient.send("GET", "/v1/me", userSchema);
    const rejected = expect(result).rejects.toMatchObject({
      kind: "cancelled"
    });
    await h.controller.logout();
    h.fetcher
      .mockResolvedValueOnce(response(credentials("bob")))
      .mockResolvedValueOnce(response(bob));
    await h.controller.signIn("login", bob.email, "synthetic password");
    pending.resolve(response(alice));
    await rejected;
    expect(h.controller.getSnapshot()).toMatchObject({
      status: "authenticated",
      user: bob
    });
    expect(h.disk()).toEqual(stored("bob"));
    await expect(
      oldClient.send("POST", "/v1/categories", z.unknown(), {
        name: "old write"
      })
    ).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("does not restore credentials after local logout failed to delete them", async () => {
    const h = harness();
    await h.controller.restore();
    h.store.clear.mockRejectedValueOnce(new Error("locked"));
    await h.controller.logout();
    await h.controller.restore();
    expect(h.controller.getSnapshot()).toEqual({
      status: "unavailable",
      reason: "storage"
    });
    expect(h.store.read).toHaveBeenCalledTimes(1);
    await h.controller.logout();
    expect(h.disk()).toBeNull();
  });
  it("does not keep a session whose token could not be stored securely", async () => {
    const h = harness(null);
    await h.controller.restore();
    h.store.write.mockRejectedValueOnce(new Error("device locked"));
    h.fetcher.mockResolvedValueOnce(response(credentials()));
    await expect(
      h.controller.signIn("login", alice.email, "synthetic password")
    ).rejects.toMatchObject({ kind: "storage" });
    expect(h.controller.getSnapshot()).toEqual({
      status: "unavailable",
      reason: "storage"
    });
    expect(h.disk()).toBeNull();
  });
});
