import type { z } from "zod";
import {
  challengeSchema,
  credentialsSchema,
  okSchema,
  userSchema,
  type CredentialStore,
  type GoogleProof,
  type StoredSession,
  type User
} from "./contracts";
import { ClientFailure, type FailureKind, type Transport } from "./transport";

type SessionState =
  | { status: "restoring" | "signing-out" }
  | { status: "signed-out"; notice?: string }
  | { status: "unavailable"; reason: FailureKind }
  | { status: "demo" }
  | { status: "authenticated"; user: User; generation: number };

// One opaque device token, valid until sign-out. Any 401 means the server
// revoked it (logout elsewhere or a disabled account), so the device signs out.
export function createSessionController(
  store: CredentialStore,
  transport: Transport,
  googleProof: GoogleProof
) {
  let state: SessionState = { status: "restoring" };
  let saved: StoredSession | null = null;
  // Every sign-in, restore, logout and demo switch starts a new epoch. Work
  // from an older epoch is discarded so a stale response cannot leak across.
  let epoch = 0;
  let authFlight: Promise<void> | undefined;
  let clearRequired = false;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (value: SessionState) => {
    state = value;
    listeners.forEach((fn) => fn());
  };
  const current = (generation: number) => {
    if (generation !== epoch) throw new ClientFailure("cancelled");
  };
  const write = (value: StoredSession | null) => {
    const next = writes.then(() =>
      value ? store.write(value) : store.clear()
    );
    writes = next.catch(() => {});
    return next.catch(() => {
      throw new ClientFailure("storage");
    });
  };
  async function invalidate(generation: number) {
    current(generation);
    const clearingEpoch = ++epoch;
    saved = null;
    clearRequired = true;
    publish({ status: "signing-out" });
    try {
      await write(null);
      current(clearingEpoch);
      clearRequired = false;
      publish({
        status: "signed-out",
        notice: "Your session ended. Please sign in again."
      });
    } catch {
      if (clearingEpoch === epoch)
        publish({ status: "unavailable", reason: "storage" });
      throw new ClientFailure("storage");
    }
  }
  async function request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    generation = epoch
  ): Promise<T> {
    current(generation);
    if (!saved) throw new ClientFailure("invalid");
    try {
      const value = await transport.send(
        method,
        path,
        schema,
        body,
        saved.token
      );
      current(generation);
      return value;
    } catch (error) {
      current(generation);
      if (error instanceof ClientFailure && error.kind === "invalid")
        await invalidate(generation);
      throw error;
    }
  }
  async function validate(generation: number) {
    const user = await request(
      "GET",
      "/v1/me",
      userSchema,
      undefined,
      generation
    );
    current(generation);
    publish({ status: "authenticated", user, generation });
  }
  function exclusive(work: () => Promise<void>) {
    if (authFlight) return authFlight;
    const flight = work();
    authFlight = flight;
    void flight
      .finally(() => {
        if (authFlight === flight) authFlight = undefined;
      })
      .catch(() => {});
    return flight;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    restore: () =>
      exclusive(async () => {
        if (clearRequired) {
          publish({ status: "unavailable", reason: "storage" });
          return;
        }
        const generation = ++epoch;
        publish({ status: "restoring" });
        try {
          await writes;
          let restored: StoredSession | null;
          try {
            restored = await store.read();
          } catch {
            throw new ClientFailure("storage");
          }
          current(generation);
          saved = restored;
          if (!saved) {
            publish({ status: "signed-out" });
            return;
          }
          await validate(generation);
        } catch (error) {
          if (generation === epoch)
            publish({
              status: "unavailable",
              reason: error instanceof ClientFailure ? error.kind : "storage"
            });
        }
      }),
    signIn: (
      method: "login" | "register" | "google",
      email = "",
      password = ""
    ) =>
      exclusive(async () => {
        if (state.status !== "signed-out") throw new ClientFailure("invalid");
        const generation = ++epoch;
        try {
          let body: unknown = { email: email.trim().toLowerCase(), password };
          if (method === "google") {
            const { nonce } = await transport.send(
              "POST",
              "/v1/auth/google/challenges",
              challengeSchema
            );
            current(generation);
            const idToken = await googleProof(nonce);
            current(generation);
            if (!idToken) return;
            body = { nonce, idToken };
          }
          const credentials = await transport.send(
            "POST",
            `/v1/auth/${method}`,
            credentialsSchema,
            body
          );
          current(generation);
          const session: StoredSession = {
            version: 2,
            token: credentials.accessToken
          };
          saved = session;
          await write(session);
          current(generation);
          await validate(generation);
        } catch (error) {
          if (generation === epoch && saved)
            publish({
              status: "unavailable",
              reason: error instanceof ClientFailure ? error.kind : "server"
            });
          throw error instanceof ClientFailure
            ? error
            : new ClientFailure("provider");
        }
      }),
    logout: (allSessions = false) =>
      exclusive(async () => {
        const previous = saved;
        ++epoch; // All previously issued readers/adapters become unusable immediately.
        saved = null;
        clearRequired = true;
        publish({ status: "signing-out" });
        try {
          await write(null);
        } catch {
          publish({ status: "unavailable", reason: "storage" });
          return;
        }
        clearRequired = false;
        let revoked = !previous && !allSessions;
        if (previous) {
          try {
            await transport.send(
              "POST",
              "/v1/auth/logout",
              okSchema,
              { allSessions },
              previous.token
            );
            revoked = true;
          } catch {
            /* Local logout succeeds even when remote revocation cannot be confirmed. */
          }
        }
        publish({
          status: "signed-out",
          notice: revoked
            ? allSessions
              ? "Signed out on all devices."
              : "Signed out."
            : allSessions
              ? "Signed out on this device. Sign-out on all devices could not be confirmed; other sessions may remain active."
              : "Signed out on this device. Server revocation could not be confirmed. The server session may still be active."
        });
      }),
    enterDemo() {
      if (state.status === "signed-out" && !authFlight) {
        ++epoch;
        publish({ status: "demo" });
      }
    },
    exitDemo() {
      if (state.status === "demo") {
        ++epoch;
        publish({ status: "signed-out" });
      }
    },
    client(generation: number): Transport {
      return {
        send: (method, path, schema, body) => {
          if (
            state.status !== "authenticated" ||
            state.generation !== generation
          )
            return Promise.reject(new ClientFailure("cancelled"));
          return request(method, path, schema, body, generation);
        }
      };
    }
  };
}
export type SessionController = ReturnType<typeof createSessionController>;
