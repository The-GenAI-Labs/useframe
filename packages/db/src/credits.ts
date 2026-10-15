import { Prisma } from "../prisma/generated/client.js";
import type { PrismaClient } from "../prisma/generated/client.js";

export type RefundRefType = "DEPLOYMENT" | "MEDIA";

export type RefundInput = {
  userId: string;
  refType: RefundRefType;
  refId: string;
  reason: string;
  // Partial refund of another charge: refunds at most `amount`, never more
  // than what is left of the charge under `chargeRefId` after earlier refunds
  // whose refId starts with `${chargeRefId}:`.
  partial?: { chargeRefId: string; amount: number };
};

export type RefundResult = {
  transactionId: string;
  amount: number;
  balanceAfter: number;
  alreadyRefunded: boolean;
};

export class RefundRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundRejectedError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function findExistingRefund(
  db: Pick<PrismaClient, "creditTransaction">,
  input: RefundInput,
): Promise<RefundResult | null> {
  const existing = await db.creditTransaction.findFirst({
    where: { userId: input.userId, type: "REFUND", refType: input.refType, refId: input.refId },
    select: { id: true, delta: true, balanceAfter: true },
  });
  return existing
    ? {
        transactionId: existing.id,
        amount: existing.delta,
        balanceAfter: existing.balanceAfter,
        alreadyRefunded: true,
      }
    : null;
}

// Idempotent: the partial unique index credit_transactions_deployment_refund_key
// makes a concurrent second refund fail its insert, which rolls back its
// balance increment; that caller then returns the winner's row.
export async function refundCredits(
  client: PrismaClient,
  input: RefundInput,
): Promise<RefundResult> {
  const existing = await findExistingRefund(client, input);
  if (existing) return existing;

  try {
    return await client.$transaction(async (tx) => {
      const chargeRefId = input.partial?.chargeRefId ?? input.refId;
      const charges = await tx.creditTransaction.findMany({
        where: {
          userId: input.userId,
          type: "SPEND",
          refId: chargeRefId,
          OR: [{ refType: input.refType }, { refType: null }],
        },
        select: { delta: true },
      });
      let charged = charges.reduce((sum, c) => sum - c.delta, 0);
      if (input.partial) {
        const earlier = await tx.creditTransaction.findMany({
          where: { userId: input.userId, type: "REFUND", refType: input.refType, refId: { startsWith: `${chargeRefId}:` } },
          select: { delta: true },
        });
        const left = charged - earlier.reduce((sum, r) => sum + r.delta, 0);
        charged = Math.min(Math.floor(input.partial.amount), left);
      }
      if (charged <= 0) {
        throw new RefundRejectedError(`Nothing to refund for ${input.refType} ${input.refId}`);
      }

      const balance = await tx.creditBalance.update({
        where: { userId: input.userId },
        data: { balance: { increment: charged } },
        select: { balance: true },
      });

      const refund = await tx.creditTransaction.create({
        data: {
          userId: input.userId,
          delta: charged,
          type: "REFUND",
          reason: input.reason,
          balanceAfter: balance.balance,
          refType: input.refType,
          refId: input.refId,
        },
        select: { id: true },
      });

      return {
        transactionId: refund.id,
        amount: charged,
        balanceAfter: balance.balance,
        alreadyRefunded: false,
      };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await findExistingRefund(client, input);
    if (!winner) throw err;
    return winner;
  }
}

export class InsufficientCreditsError extends Error {
  constructor(public readonly needed: number, public readonly balance: number) {
    super(`Insufficient credits: need ${needed}, have ${balance}`);
    this.name = "InsufficientCreditsError";
  }
}

// Atomic deduction used by services outside apps/server (media reservations).
export async function spendCredits(
  client: Pick<PrismaClient, "$transaction">,
  input: { userId: string; amount: number; reason: string; refType: RefundRefType; refId: string },
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("amount must be a positive integer");
  return client.$transaction(async (tx) => {
    const updated = await tx.creditBalance.updateMany({
      where: { userId: input.userId, balance: { gte: input.amount } },
      data: { balance: { decrement: input.amount } },
    });
    const balance = await tx.creditBalance.findUnique({ where: { userId: input.userId }, select: { balance: true } });
    if (updated.count === 0) throw new InsufficientCreditsError(input.amount, balance?.balance ?? 0);
    await tx.creditTransaction.create({
      data: {
        userId: input.userId,
        delta: -input.amount,
        type: "SPEND",
        reason: input.reason,
        balanceAfter: balance!.balance,
        refType: input.refType,
        refId: input.refId,
      },
    });
    return { balanceAfter: balance!.balance };
  });
}
