// Usage (from packages/db, which loads its .env): pnpm exec tsx ../../scripts/admin/grant-credits.ts
//   --email someone@example.com --credits 400 --reason "manual internal test grant" [--key <idempotency key>] --confirm
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { grantCredits, prisma } from "../../packages/db/src/index.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    credits: { type: "string" },
    reason: { type: "string" },
    key: { type: "string" },
    confirm: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase();
const credits = Number(values.credits);
const reason = values.reason?.trim();
if (!email || !reason || !Number.isInteger(credits) || credits <= 0) {
  fail("Required: --email <address> --credits <positive integer> --reason <text> [--key <id>] --confirm");
}
const idempotencyKey = values.key ?? createHash("sha256").update(`${email}|${credits}|${reason}`).digest("hex").slice(0, 24);

async function main() {
  const identities = await prisma.identity.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { userId: true },
  });
  const userIds = [...new Set(identities.map((i) => i.userId))];
  if (userIds.length !== 1) fail(`Expected exactly one user for ${email}, found ${userIds.length}.`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] }, select: { id: true, name: true } });
  const current = await prisma.creditBalance.findUnique({ where: { userId: user.id }, select: { balance: true } });
  console.log(`User ${user.id} (${user.name ?? "no name"}), balance ${current?.balance ?? 0}`);
  console.log(`Grant ${credits} credits, reason "${reason}", idempotency key ${idempotencyKey}`);
  if (!values.confirm) fail("Dry run only: add --confirm to grant.");

  const result = await grantCredits(prisma, { userId: user.id, amount: credits, reason, idempotencyKey });
  console.log(
    result.alreadyGranted
      ? `Already granted under this key (transaction ${result.transactionId}); balance stays ${result.balanceAfter}.`
      : `Granted: balance ${result.balanceBefore} -> ${result.balanceAfter} (transaction ${result.transactionId}).`,
  );
}

main()
  .catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => prisma.$disconnect());
