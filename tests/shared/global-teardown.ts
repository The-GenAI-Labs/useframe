import { cleanupRunUsers, prisma } from "./fixtures.js";

export default async function globalTeardown() {
  await cleanupRunUsers();
  await prisma.$disconnect();
}
