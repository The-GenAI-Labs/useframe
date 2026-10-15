import { testEnv } from "./env.js";
import { mintMagicLink, prisma, seedFixtures } from "./fixtures.js";
import { verifyMagicLink } from "./auth.js";

export default async function globalSetup() {
  const fixtures = await seedFixtures();

  // A server wired to a different database would make every test fail confusingly.
  const res = await verifyMagicLink(await mintMagicLink(testEnv.userEmail));
  if (!res.ok) {
    throw new Error(
      `The API at ${testEnv.apiUrl} did not accept a sign-in written to ${new URL(testEnv.databaseUrl).host}. ` +
        "It is probably connected to another database; stop it or point API_URL at the test stack.",
    );
  }

  process.env.E2E_FIXTURES = JSON.stringify(fixtures);
  await prisma.$disconnect();
}
