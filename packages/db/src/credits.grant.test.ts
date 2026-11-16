import { describe, expect, it } from "vitest";
import { ADMIN_GRANT_REF_TYPE, grantCredits } from "./credits.js";

type Txn = { id: string; userId: string; delta: number; refType: string; refId: string; balanceAfter: number; reason: string };

function fakeClient(startBalance: number | null) {
  const state = { balance: startBalance, txns: [] as Txn[], locks: 0 };
  const tx = {
    $queryRaw: async () => {
      state.locks++;
      return [];
    },
    creditBalance: {
      findUnique: async () => (state.balance === null ? null : { balance: state.balance }),
      upsert: async ({ create, update }: { create: { balance: number }; update: { balance: { increment: number } } }) => {
        state.balance = state.balance === null ? create.balance : state.balance + update.balance.increment;
        return { balance: state.balance };
      },
    },
    creditTransaction: {
      findFirst: async ({ where }: { where: { userId: string; refType: string; refId: string } }) =>
        state.txns.find((t) => t.userId === where.userId && t.refType === where.refType && t.refId === where.refId) ?? null,
      create: async ({ data }: { data: Omit<Txn, "id"> }) => {
        const row = { id: `txn_${state.txns.length + 1}`, ...data };
        state.txns.push(row);
        return { id: row.id };
      },
    },
  };
  const client = { $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  return { client: client as unknown as Parameters<typeof grantCredits>[0], state };
}

const input = { userId: "u1", amount: 400, reason: "manual internal test grant", idempotencyKey: "k1" };

describe("grantCredits", () => {
  it("creates the balance, writes one ledger row and reports before/after", async () => {
    const { client, state } = fakeClient(null);
    expect(await grantCredits(client, input)).toEqual({
      transactionId: "txn_1",
      balanceBefore: 0,
      balanceAfter: 400,
      alreadyGranted: false,
    });
    expect(state.txns).toEqual([
      expect.objectContaining({ delta: 400, balanceAfter: 400, refType: ADMIN_GRANT_REF_TYPE, refId: "k1", reason: input.reason }),
    ]);
    expect(state.locks).toBe(1);
  });

  it("does not grant twice for the same idempotency key", async () => {
    const { client, state } = fakeClient(25);
    await grantCredits(client, input);
    expect(await grantCredits(client, input)).toEqual({
      transactionId: "txn_1",
      balanceBefore: 425,
      balanceAfter: 425,
      alreadyGranted: true,
    });
    expect(state.balance).toBe(425);
    expect(state.txns).toHaveLength(1);
  });

  it("grants again under a different key", async () => {
    const { client, state } = fakeClient(0);
    await grantCredits(client, input);
    await grantCredits(client, { ...input, idempotencyKey: "k2" });
    expect(state.balance).toBe(800);
  });

  it("rejects non-positive or fractional amounts", async () => {
    const { client } = fakeClient(0);
    await expect(grantCredits(client, { ...input, amount: 0 })).rejects.toThrow("positive integer");
    await expect(grantCredits(client, { ...input, amount: 1.5 })).rejects.toThrow("positive integer");
  });
});
