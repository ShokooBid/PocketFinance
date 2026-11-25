// Mobile projections of the published API contracts. Validate every response;
// never import server code. The session token is opaque to the client.
import { z } from "zod";

const sessionToken = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);
export const credentialsSchema = z.object({
  accessToken: sessionToken,
  tokenType: z.literal("Bearer")
});
// One device credential, valid until sign-out. Version 1 (refresh-token era)
// entries fail this schema and are discarded, so users sign in once more.
export const storedSessionSchema = z.object({
  version: z.literal(2),
  token: sessionToken
});
export type StoredSession = z.infer<typeof storedSessionSchema>;
export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerified: z.boolean(),
  methods: z.object({ password: z.boolean(), google: z.boolean() })
});
export type User = z.infer<typeof userSchema>;
export const challengeSchema = z.object({
  nonce: z.string().regex(/^[A-Za-z0-9_.-]{1,256}$/),
  expiresAt: z.iso.datetime()
});
export const okSchema = z.object({ ok: z.literal(true) });

export interface CredentialStore {
  read(): Promise<StoredSession | null>;
  write(value: StoredSession): Promise<void>;
  clear(): Promise<void>;
}
export type GoogleProof = (nonce: string) => Promise<string | null>;
