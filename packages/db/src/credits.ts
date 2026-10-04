import { Prisma } from "../prisma/generated/client.js";
import type { PrismaClient } from "../prisma/generated/client.js";

export type RefundRefType = "DEPLOYMENT";

export type RefundInput = {
  userId: string;
  refType: RefundRefType;
  refId: string;
  reason: string;
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
      const charges = await tx.creditTransaction.findMany({
        where: {
          userId: input.userId,
          type: "SPEND",
          refId: input.refId,
          OR: [{ refType: input.refType }, { refType: null }],
        },
        select: { delta: true },
      });
      const charged = charges.reduce((sum, c) => sum - c.delta, 0);
      if (charged <= 0) {
        throw new RefundRejectedError(`No charge found for ${input.refType} ${input.refId}`);
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
