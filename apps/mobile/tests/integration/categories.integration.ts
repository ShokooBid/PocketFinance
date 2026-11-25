// Runs the actual portable mobile client against Fastify and real disposable
// PostgreSQL. Only OS storage and the HTTP socket are replaced, not auth/routes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../api/src/app.js";
import { createAuthService } from "../../../api/src/auth/service.js";
import { createCategoryService } from "../../../api/src/categories/service.js";
import { createTransactionService } from "../../../api/src/transactions/service.js";
import { createDashboardService } from "../../../api/src/dashboard/service.js";
import { createApiDashboardSource, moneyLabel } from "../../src/dashboard-data";
import { createApiTransactionSource } from "../../src/transaction-api";
import {
  draftInput,
  currencyExponents,
  type Currency
} from "../../src/transaction-data";
import { testConfig, testAccount } from "../../../api/tests/fixtures.js";
import { disposableDatabase } from "../../../api/tests/support/disposable.js";
import { createSessionController } from "../../src/auth/session-controller";
import { createTransport, type FetchRequest } from "../../src/auth/transport";
import { createApiCategorySource } from "../../src/category-api";
import type {
  CredentialStore,
  StoredSession,
  GoogleProof
} from "../../src/auth/contracts";
import { invalidCredentials } from "../../../api/src/errors.js";

const database = disposableDatabase();
const db = database.db;
let app: Awaited<ReturnType<typeof buildApp>>;
let clock = Date.now();
const config = testConfig();
const requests: string[] = [];
// Replace only Google's external verification boundary with nonce-bound
// synthetic identities. API unit tests cover real local cryptographic proofs.
const providerProofs = new Map<
  string,
  { subject: string; email: string; nonce: string }
>();
const fetcher: FetchRequest = async (input, options) => {
  const url = new URL(String(input));
  requests.push(`${options?.method ?? "GET"} ${url.pathname}`);
  const headers = Object.fromEntries(new Headers(options?.headers).entries());
  const result = await app.inject({
    method: (options?.method ?? "GET") as "GET" | "POST" | "PATCH" | "DELETE",
    url: url.pathname + url.search,
    headers,
    ...(typeof options?.body === "string" ? { payload: options.body } : {})
  });
  return new Response(result.body, { status: result.statusCode });
};
function device(proof: GoogleProof = async () => null) {
  let disk: StoredSession | null = null;
  const store: CredentialStore = {
    read: async () => disk,
    write: async (value) => {
      disk = value;
    },
    clear: async () => {
      disk = null;
    }
  };
  const make = () =>
    createSessionController(
      store,
      createTransport("https://api.example.invalid", fetcher),
      proof
    );
  const controller = make();
  const source = (session = controller) => {
    const state = session.getSnapshot();
    if (state.status !== "authenticated")
      throw new Error("Test requires verified session.");
    return createApiCategorySource(session.client(state.generation));
  };
  return { controller, restart: make, source, disk: () => disk };
}
beforeAll(async () => {
  await database.start();
  const auth = await createAuthService(
    db,
    config,
    async (token, nonce) => {
      const proof = providerProofs.get(token);
      if (!proof || proof.nonce !== nonce) throw invalidCredentials();
      return {
        subject: proof.subject,
        email: proof.email,
        verifiedEmail: true
      };
    },
    () => new Date(clock)
  );
  app = await buildApp(config, auth, {
    logger: false,
    rateLimitMax: 10000,
    categories: createCategoryService(db),
    transactions: createTransactionService(db),
    dashboard: createDashboardService(db)
  });
});
afterAll(async () => {
  try {
    await app?.close();
  } finally {
    await database.close();
  }
});

describe("authenticated mobile category flow", () => {
  it("uses v1 for personal hierarchy, fixed defaults, safe errors and session isolation", async () => {
    const d = device();
    await d.controller.restore();
    await d.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic hierarchy password"
    );
    const state = d.controller.getSnapshot();
    if (state.status !== "authenticated") throw new Error("No session");
    const source = d.source();
    await source.create("Mobile parent");
    const root = (await source.list()).find(
      (row) => row.name === "Mobile parent"
    )!;
    const childId = await source.createChild!("Mobile child", root.id);
    expect(
      (await source.list()).find((row) => row.id === childId)?.parentId
    ).toBe(root.id);

    await expect(
      source.createChild!(" mobile CHILD ", root.id)
    ).rejects.toMatchObject({ code: "duplicate" });
    await expect(
      source.createChild!("Too deep", childId)
    ).rejects.toMatchObject({ code: "invalid-parent" });
    const fixed = await db.category.create({
      data: {
        userId: null,
        name: "Synthetic mobile default",
        isDefault: true,
        defaultKey: "test.mobile"
      }
    });
    await source.createChild!("Personal under fixed", fixed.id);
    await expect(source.rename(fixed.id, "Rename")).rejects.toMatchObject({
      code: "read-only"
    });
    await expect(source.archive(fixed.id)).rejects.toMatchObject({
      code: "read-only"
    });
    await source.rename(childId, "Renamed child");
    await source.archive(root.id);
    expect(
      (await source.list()).find((row) => row.id === childId)?.archivedAt
    ).not.toBeNull();
    const other = device();
    await other.controller.restore();
    await other.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic other hierarchy password"
    );
    const otherSource = other.source();
    expect((await otherSource.list()).every((row) => row.isDefault)).toBe(true);
    await expect(
      otherSource.createChild!("Foreign parent", root.id)
    ).rejects.toMatchObject({ code: "unavailable" });
    await d.controller.logout();
    await expect(source.list()).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("signs in with Google by subject on a new device, keeps the ledger and never merges by email", async () => {
    const subject = `google-subject-${randomUUID()}`;
    const email = `${randomUUID()}@example.invalid`;
    let proofEmail = email;
    const google = async (nonce: string) => {
      const token = randomUUID();
      providerProofs.set(token, { subject, email: proofEmail, nonce });
      return token;
    };
    const first = device(google);
    await first.controller.restore();
    await first.controller.signIn("google");
    const before = first.controller.getSnapshot();
    if (before.status !== "authenticated") throw new Error("No session");
    expect(before.user.methods).toEqual({ password: false, google: true });
    await first.source().create("Google ledger category");
    // A changed Google email still resolves to the same owner by subject.
    proofEmail = `${randomUUID()}@example.invalid`;
    const second = device(google);
    await second.controller.restore();
    await second.controller.signIn("google");
    const after = second.controller.getSnapshot();
    if (after.status !== "authenticated") throw new Error("No session");
    expect(after.user.id).toBe(before.user.id);
    expect(
      (await second.source().list()).some(
        (row) => row.name === "Google ledger category"
      )
    ).toBe(true);
    // An existing password account is never taken over by a Google proof.
    const passwordEmail = `${randomUUID()}@example.invalid`;
    const owner = device();
    await owner.controller.restore();
    await owner.controller.signIn(
      "register",
      passwordEmail,
      "synthetic other password"
    );
    const intruder = device(async (nonce) => {
      const token = randomUUID();
      providerProofs.set(token, {
        subject: `other-${randomUUID()}`,
        email: passwordEmail,
        nonce
      });
      return token;
    });
    await intruder.controller.restore();
    await expect(intruder.controller.signIn("google")).rejects.toMatchObject({
      kind: "invalid"
    });
    expect(intruder.controller.getSnapshot().status).toBe("signed-out");
    expect(await db.user.count({ where: { email: passwordEmail } })).toBe(1);
  });
  it("revokes current/all-device sessions without affecting another owner or deleting ledger records", async () => {
    const email = `${randomUUID()}@example.invalid`;
    const first = device();
    const second = device();
    const other = device();
    await Promise.all([
      first.controller.restore(),
      second.controller.restore(),
      other.controller.restore()
    ]);
    await first.controller.signIn(
      "register",
      email,
      "synthetic logout password"
    );
    await second.controller.signIn("login", email, "synthetic logout password");
    await other.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic other password"
    );
    await first.source().create("Retained after sign out");
    const state = first.controller.getSnapshot();
    if (state.status !== "authenticated") throw new Error("No session");
    await first.controller.logout();
    expect(first.disk()).toBeNull();
    expect(
      await db.session.count({
        where: { userId: state.user.id }
      })
    ).toBe(1);
    expect(
      (await second.source().list()).filter((row) => !row.isDefault)
    ).toHaveLength(1);
    await first.controller.signIn("login", email, "synthetic logout password");
    const oldSource = first.source();
    await second.controller.logout(true);
    expect(second.disk()).toBeNull();
    expect(second.controller.getSnapshot()).toMatchObject({
      status: "signed-out",
      notice: "Signed out on all devices."
    });
    expect(
      await db.session.count({
        where: { userId: state.user.id }
      })
    ).toBe(0);
    await expect(oldSource.list()).rejects.toBeDefined();
    expect(first.disk()).toBeNull();
    expect((await other.source().list()).every((row) => row.isDefault)).toBe(
      true
    );
    expect(
      await db.category.count({
        where: { userId: state.user.id, name: "Retained after sign out" }
      })
    ).toBe(1);
  });
  it("renders the real monthly API contract through the verified mobile client and isolates accounts", async () => {
    const alice = device();
    await alice.controller.restore();
    await alice.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic dashboard passphrase"
    );
    await alice.source().create("Dashboard fixture");
    const category = (await alice.source().list()).find(
      (row) => row.name === "Dashboard fixture"
    )!;
    const state = alice.controller.getSnapshot();
    if (state.status !== "authenticated") throw new Error("No session");
    const transactions = createApiTransactionSource(
      alice.controller.client(state.generation)
    );
    const dashboard = createApiDashboardSource(
      alice.controller.client(state.generation),
      transactions
    );
    const input = {
      direction: "expense" as const,
      amountMinor: 250,
      date: "2026-10-01",
      categoryId: category.id,
      accountId: (await testAccount(db, state.user.id, "USD")).id,
      note: null
    };
    const expense = await transactions.create({
      ...input,
      clientRequestId: randomUUID()
    });
    await transactions.create({
      ...{
        ...input,
        direction: "income",
        amountMinor: 2000,
        date: "2026-10-31"
      },
      clientRequestId: randomUUID()
    });
    await transactions.create({
      ...{
        ...input,
        direction: "income",
        amountMinor: 50,
        date: "2026-10-15"
      },
      clientRequestId: randomUUID()
    });
    await transactions.create({
      ...{
        ...input,
        amountMinor: 999,
        date: "2026-09-30"
      },
      clientRequestId: randomUUID()
    });

    const summary = await dashboard.summary({
      month: "2026-10",
      currency: "USD"
    });
    expect(summary).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      incomeMinor: 2050,
      expensesMinor: 250,
      netMinor: 1800,
      categoryBreakdown: [
        {
          categoryName: "Dashboard fixture",
          incomeMinor: 2050,
          expensesMinor: 250,
          netMinor: 1800
        }
      ]
    });
    expect(summary.recentTransactions.map((row) => row.date)).toEqual([
      "2026-10-31",
      "2026-10-15",
      "2026-10-01"
    ]);
    expect(moneyLabel(summary.netMinor, summary.currency)).toBe("USD 18.00");
    expect(
      await dashboard.summary({ month: "2024-02", currency: "USD" })
    ).toMatchObject({
      from: "2024-02-01",
      to: "2024-02-29",
      incomeMinor: 0,
      expensesMinor: 0,
      netMinor: 0,
      categoryBreakdown: [],
      recentTransactions: []
    });
    await alice.source().archive(category.id);
    await transactions.update(expense.id, { amountMinor: 300 });
    expect(
      await dashboard.summary({ month: "2026-10", currency: "USD" })
    ).toMatchObject({
      expensesMinor: 300,
      netMinor: 1750,
      categoryBreakdown: [{ categoryName: "Dashboard fixture" }]
    });
    const bob = device();
    await bob.controller.restore();
    await bob.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic other passphrase"
    );
    const other = bob.controller.getSnapshot();
    if (other.status !== "authenticated") throw new Error("No session");
    const otherTransactions = createApiTransactionSource(
      bob.controller.client(other.generation)
    );
    expect(
      await createApiDashboardSource(
        bob.controller.client(other.generation),
        otherTransactions
      ).summary({ month: "2026-10", currency: "USD" })
    ).toMatchObject({
      incomeMinor: 0,
      expensesMinor: 0,
      netMinor: 0,
      categoryBreakdown: [],
      recentTransactions: []
    });
    await alice.controller.logout();
    await expect(
      dashboard.summary({ month: "2026-10", currency: "USD" })
    ).rejects.toMatchObject({ kind: "cancelled" });
  });
  it("submits exact mobile amounts, filters, edits and deletes through verified sessions", async () => {
    for (const currency of Object.keys(currencyExponents) as Currency[]) {
      const d = device();
      await d.controller.restore();
      await d.controller.signIn(
        "register",
        `${randomUUID()}@example.invalid`,
        "synthetic mobile passphrase"
      );
      await d.source().create("Transaction category");
      const category = (await d.source().list()).find((row) => !row.isDefault)!;
      const state = d.controller.getSnapshot();
      if (state.status !== "authenticated") throw new Error("No session");
      const source = createApiTransactionSource(
        d.controller.client(state.generation)
      );
      const selectedAccount = await testAccount(db, state.user.id, currency);
      const exponent = currencyExponents[currency];
      const input = draftInput(
        {
          direction: "expense",
          amount: exponent ? `1.${"0".repeat(exponent - 1)}1` : "1",
          currency,
          date: "2024-02-29",
          categoryId: category.id,
          accountId: selectedAccount.id,
          note: ""
        },
        { id: selectedAccount.id, currency }
      );
      const row = await source.create({
        ...input,
        clientRequestId: randomUUID()
      });
      expect(await d.source().lastUsedCategoryId()).toBe(category.id);
      expect(row.amountMinor).toBe(
        exponent === 3 ? 1001 : exponent === 2 ? 101 : 1
      );
      expect(
        (await db.transaction.findUniqueOrThrow({ where: { id: row.id } }))
          .amountMinor
      ).toBe(row.amountMinor);
      expect(
        (
          await source.list({
            from: "2024-02-29",
            to: "2024-02-29",
            direction: "expense",
            categoryId: category.id
          })
        ).items.some((item) => item.id === row.id)
      ).toBe(true);
      expect(
        (await source.update(row.id, { ...input, amountMinor: 2 })).amountMinor
      ).toBe(2);
      await source.remove(row.id);
      expect(await d.source().lastUsedCategoryId()).toBeNull();
      expect((await source.list({})).items).toEqual([]);
      await d.controller.logout();
      await expect(source.list({})).rejects.toMatchObject({
        kind: "cancelled"
      });
    }
  });
  it("creates, validates, paginates, renames and archives while preserving history", async () => {
    const d = device();
    await d.controller.restore();
    await d.controller.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic mobile passphrase"
    );
    const source = d.source();
    await source.create("  Daily\tfood ");
    const original = (await source.list()).find(
      (row) => row.name === "Daily food"
    )!;
    expect(original.name).toBe("Daily food");
    await expect(source.create("daily FOOD")).rejects.toMatchObject({
      code: "duplicate"
    });
    await expect(source.rename(original.id, " ")).rejects.toMatchObject({
      code: "validation"
    });
    await source.rename(original.id, "Groceries");
    const user = d.controller.getSnapshot();
    if (user.status !== "authenticated") throw new Error("Test lost session.");
    const tx = await db.transaction.create({
      data: {
        userId: user.user.id,
        categoryId: original.id,
        direction: "expense",
        amountMinor: 100,
        date: new Date("2026-01-01"),
        accountId: (await testAccount(db, user.user.id, "USD")).id
      }
    });
    await source.archive(original.id);
    expect(
      (await source.list()).find((row) => row.id === original.id)?.archivedAt
    ).not.toBeNull();
    await source.create("GROCERIES");
    const history = await db.transaction.findUniqueOrThrow({
      where: { id: tx.id },
      include: { category: true }
    });
    expect(history.category).not.toBeNull();
    expect(history.category?.id).toBe(original.id);
    expect(history.category?.archivedAt).not.toBeNull();
    await db.category.createMany({
      data: Array.from({ length: 102 }, (_, n) => ({
        userId: user.user.id,
        name: `Synthetic page ${n}`
      }))
    });
    const pages = requests.length;
    expect((await source.list()).filter((row) => !row.isDefault)).toHaveLength(
      104
    );
    expect(requests.slice(pages)).toEqual([
      "GET /v1/categories",
      "GET /v1/categories"
    ]);
  });
  it("restores after a long idle period, rejects revocation and isolates accounts", async () => {
    const d = device();
    await d.controller.restore();
    const aliceEmail = `${randomUUID()}@example.invalid`;
    await d.controller.signIn(
      "register",
      aliceEmail,
      "synthetic mobile passphrase"
    );
    await d.source().create("Alice private category");
    const aliceId = (await d.source().list()).find((row) => !row.isDefault)!.id;
    clock += 400 * 86_400_000;
    const restored = d.restart();
    await restored.restore();
    expect(restored.getSnapshot().status).toBe("authenticated");
    const source = d.source(restored);
    const start = requests.length;
    await Promise.all([source.list(), source.list(), source.list()]);
    expect(
      requests.slice(start).every((path) => !path.includes("/auth/"))
    ).toBe(true);
    const aliceState = restored.getSnapshot();
    if (aliceState.status !== "authenticated")
      throw new Error("Test lost session.");
    // Server-side revocation, as logout on another device would do.
    await db.session.deleteMany({ where: { userId: aliceState.user.id } });
    await expect(source.list()).rejects.toBeDefined();
    expect(restored.getSnapshot().status).toBe("signed-out");
    expect(d.disk()).toBeNull();
    await restored.signIn(
      "register",
      `${randomUUID()}@example.invalid`,
      "synthetic mobile passphrase"
    );
    const bobSource = d.source(restored);
    expect((await bobSource.list()).every((row) => row.isDefault)).toBe(true);
    await expect(bobSource.rename(aliceId, "Intrusion")).rejects.toMatchObject({
      code: "unavailable"
    });
    await expect(bobSource.archive(aliceId)).rejects.toMatchObject({
      code: "unavailable"
    });
    await bobSource.create("Bob category");
    const bobState = restored.getSnapshot();
    if (bobState.status !== "authenticated")
      throw new Error("Test lost session.");
    await restored.logout();
    expect(d.disk()).toBeNull();
    expect(
      await db.session.count({
        where: { userId: bobState.user.id }
      })
    ).toBe(0);
    await expect(bobSource.list()).rejects.toMatchObject({ kind: "cancelled" });
    await restored.signIn("login", aliceEmail, "synthetic mobile passphrase");
    expect(
      (await d.source(restored).list())
        .filter((row) => !row.isDefault)
        .map((row) => row.name)
    ).toEqual(["Alice private category"]);
  });
});
