import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./index.js";
import { refundCredits, RefundRejectedError } from "./credits.js";

// Writes real rows (a throwaway user, removed afterwards), so it only runs
// when explicitly enabled against a database you own.
const suite = process.env.DB_INTEGRATION === "1" ? describe : describe.skip;

suite("refundCredits (PostgreSQL)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { name: "refund-test" } });
    userId = user.id;
    await prisma.creditBalance.create({
      data: { userId, balance: 10, periodEnd: new Date(Date.now() + 86_400_000) },
    });
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function charge(refId: string, amount = 1) {
    await prisma.$transaction(async (tx) => {
      await tx.creditBalance.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });
      const { balance } = await tx.creditBalance.findUniqueOrThrow({ where: { userId } });
      await tx.creditTransaction.create({
        data: {
          userId,
          delta: -amount,
          type: "SPEND",
          reason: "Deploy",
          balanceAfter: balance,
          refType: "DEPLOYMENT",
          refId,
        },
      });
    });
  }

  const balance = async () =>
    (await prisma.creditBalance.findUniqueOrThrow({ where: { userId } })).balance;

  it("refunds once and treats a repeat as a no-op", async () => {
    await charge("dep-double");
    const before = await balance();
    const first = await refundCredits(prisma, {
      userId,
      refType: "DEPLOYMENT",
      refId: "dep-double",
      reason: "Deploy failed",
    });
    const second = await refundCredits(prisma, {
      userId,
      refType: "DEPLOYMENT",
      refId: "dep-double",
      reason: "Deploy failed",
    });
    expect(first.alreadyRefunded).toBe(false);
    expect(first.amount).toBe(1);
    expect(second.alreadyRefunded).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(await balance()).toBe(before + 1);
  });

  it("applies exactly one refund under concurrency", async () => {
    await charge("dep-race", 2);
    const before = await balance();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        refundCredits(prisma, {
          userId,
          refType: "DEPLOYMENT",
          refId: "dep-race",
          reason: "Deploy failed",
        }),
      ),
    );
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(results.filter((r) => !r.alreadyRefunded)).toHaveLength(1);
    expect(await balance()).toBe(before + 2);
    const refunds = await prisma.creditTransaction.count({
      where: { userId, type: "REFUND", refId: "dep-race" },
    });
    expect(refunds).toBe(1);
  });

  it("rejects a refund with no matching charge", async () => {
    const before = await balance();
    await expect(
      refundCredits(prisma, {
        userId,
        refType: "DEPLOYMENT",
        refId: "dep-never-charged",
        reason: "Deploy failed",
      }),
    ).rejects.toBeInstanceOf(RefundRejectedError);
    expect(await balance()).toBe(before);
  });
});
