import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError, invalidCredentials } from "../errors.js";
import { nonceFormat, tokenHash } from "./crypto.js";
import type { AuthService, Principal } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
  interface FastifyInstance {
    authenticate(request: FastifyRequest): Promise<void>;
  }
}

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string()
  })
});
const errors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  413: errorSchema,
  415: errorSchema,
  422: errorSchema,
  429: errorSchema,
  500: errorSchema,
  503: errorSchema
};
const password = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => /\S/.test(value), "Use a nonblank password.");
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const loginInput = z.strictObject({
  email,
  password: z.string().min(1).max(128)
});
const googleInput = z.strictObject({
  nonce: z.string().regex(nonceFormat),
  idToken: z.string().min(1).max(16384)
});
// One opaque bearer token per device. It is valid until logout.
const tokens = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer")
});
const ok = z.object({ ok: z.literal(true) });
const challengeResponse = z.object({
  nonce: z.string(),
  expiresAt: z.iso.datetime()
});

export function registerAuthRoutes(
  instance: FastifyInstance,
  auth: AuthService
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.decorateRequest("principal", null);
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(
      request.headers.authorization ?? ""
    );
    if (!match?.[1]) throw invalidCredentials();
    request.principal = await auth.authenticate(match[1]);
  });

  // Bounded process-local per-email limiter supplements the global IP limiter.
  const attempts = new Map<string, { count: number; until: number }>();
  const accountLimit = async (request: FastifyRequest) => {
    const body = request.body as { email?: string } | undefined;
    if (!body?.email) return;
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const key = tokenHash(body.email);
    const record = attempts.get(key) ?? { count: 0, until: now + 900_000 };
    if (++record.count > 10 || (!attempts.has(key) && attempts.size >= 10000))
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later."
      );
    attempts.set(key, record);
  };
  const schema = { tags: ["Authentication"], response: errors };
  const secured = { ...schema, security: [{ bearerAuth: [] }] };

  app.post(
    "/v1/auth/register",
    {
      preHandler: accountLimit,
      schema: {
        ...schema,
        body: z.strictObject({ email, password }),
        response: { ...errors, 201: tokens }
      }
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await auth.register(request.body.email, request.body.password))
  );
  app.post(
    "/v1/auth/login",
    {
      preHandler: accountLimit,
      schema: {
        ...schema,
        body: loginInput,
        response: { ...errors, 200: tokens }
      }
    },
    async (request) => auth.login(request.body.email, request.body.password)
  );
  app.post(
    "/v1/auth/google/challenges",
    {
      schema: {
        ...schema,
        response: { ...errors, 201: challengeResponse }
      }
    },
    async (_request, reply) => reply.code(201).send(auth.challenge())
  );
  app.post(
    "/v1/auth/google",
    {
      schema: {
        ...schema,
        body: googleInput,
        response: { ...errors, 200: tokens }
      }
    },
    async (request) => auth.googleLogin(request.body)
  );
  app.post(
    "/v1/auth/logout",
    {
      preHandler: app.authenticate,
      schema: {
        ...secured,
        body: z.strictObject({ allSessions: z.boolean().default(false) }),
        response: { ...errors, 200: ok }
      }
    },
    async (request) => {
      await auth.logout(request.principal!, request.body.allSessions);
      return { ok: true as const };
    }
  );
  app.get(
    "/v1/me",
    {
      preHandler: app.authenticate,
      schema: {
        ...secured,
        response: {
          ...errors,
          200: z.object({
            id: z.uuid(),
            email: z.string(),
            emailVerified: z.boolean(),
            methods: z.object({ password: z.boolean(), google: z.boolean() })
          })
        }
      }
    },
    async (request) => auth.currentUser(request.principal!)
  );
}
