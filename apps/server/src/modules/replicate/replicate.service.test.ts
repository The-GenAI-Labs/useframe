import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  balance: vi.fn(),
  transaction: vi.fn(),
  claim: vi.fn(),
  create: vi.fn(),
  add: vi.fn(),
  deduct: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("@useframe/db", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    creditBalance: { findUnique: mocks.balance },
    $transaction: mocks.transaction,
  },
}));
vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.add;
  },
}));
vi.mock("@/lib/redis.js", () => ({ redis: {} }));
vi.mock("@/lib/slug.js", () => ({ uniqueSlug: () => "example-test" }));
vi.mock("@/middleware/errorHandler.js", () => ({
  AppError: class extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public code?: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/modules/credits/credits.service.js", () => ({
  CreditsService: { deduct: mocks.deduct, triggerAutoReload: mocks.reload },
}));
vi.mock("@/modules/generate/generate.service.js", () => ({
  GENERATE_CREDIT_COST: 5,
}));
import { ReplicateService } from "./replicate.service.js";

const tx = {
  user: { updateMany: mocks.claim },
  replication: { create: mocks.create },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ freeReplicationUsed: false });
  mocks.balance.mockResolvedValue({ balance: 0 });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({
    id: "replication-id",
    slug: "example-test",
  });
  mocks.transaction.mockImplementation(
    async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  );
  mocks.deduct.mockResolvedValue({
    balanceAfter: 5,
    autoReloadTopUpCents: null,
  });
});

describe("replication creation", () => {
  it("keeps the free-use claim and creation atomic with a remote-database timeout", async () => {
    await ReplicateService.replicate("owner", { url: "https://example.com" });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "owner", freeReplicationUsed: false },
      }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "owner", tier: "FREE" }),
      }),
    );
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });

  it("does not create or enqueue when another request consumed the free use", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    await expect(
      ReplicateService.replicate("owner", { url: "https://example.com" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("deducts paid credits inside the same transaction without rereading the balance", async () => {
    mocks.balance.mockResolvedValue({ balance: 10 });
    await ReplicateService.replicate("owner", { url: "https://example.com" });
    expect(mocks.balance).toHaveBeenCalledTimes(1);
    expect(mocks.deduct).toHaveBeenCalledWith(
      tx,
      "owner",
      5,
      "Replication",
      undefined,
    );
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("returns a retryable timeout without exposing Prisma internals or queuing a job", async () => {
    mocks.transaction.mockRejectedValue({
      code: "P2028",
      message: "internal database details",
    });
    await expect(
      ReplicateService.replicate("owner", { url: "https://example.com" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "REPLICATION_START_TIMEOUT",
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
