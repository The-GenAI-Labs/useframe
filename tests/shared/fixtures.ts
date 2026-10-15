import { createHash, randomBytes } from "node:crypto";
import { testEnv } from "./env.js";
import { prisma } from "@useframe/db";

export const FIXTURE = {
  workspaceSlug: "e2e-workspace",
  deploySlug: "e2e-deploy-ready",
  retiredPlanSlug: "e2e-retired-plan",
  runEmailPrefix: "e2e-run-",
};

const SITE_SPEC = {
  siteType: "SINGLE_PAGE",
  pages: [
    {
      type: "HOME",
      slug: "home",
      title: "Home",
      sections: [
        {
          type: "HERO",
          index: 0,
          content: {
            headline: "E2E fixture site",
            subheadline: "Seeded by the test suites",
            cta: { primary: "Get started", primaryHref: "#" },
          },
        },
      ],
    },
  ],
  designSystem: {
    primaryColor: "#2563eb",
    secondaryColor: "#0f172a",
    accentColor: "#f59e0b",
    fontPrimary: "Inter",
    fontSecondary: "Inter",
    spacing: "normal",
    borderRadius: "md",
    animationStyle: "subtle",
  },
  copyFramework: "AIDA",
  citations: [],
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function upsertUser(email: string, name: string): Promise<string> {
  const identity = await prisma.identity.findUnique({
    where: { type_externalId: { type: "EMAIL", externalId: email } },
    select: { userId: true },
  });
  // acceptedTermsAt makes sign-in skip consent capture and signup risk scoring.
  const profile = { name, acceptedTermsAt: new Date(), acceptedTermsVersion: "2026-09-v1", signupRiskDecision: "ALLOW" };
  if (identity) {
    await prisma.user.update({ where: { id: identity.userId }, data: profile });
    return identity.userId;
  }
  const user = await prisma.user.create({
    data: {
      ...profile,
      identities: { create: { type: "EMAIL", externalId: email, email, isPrimary: true, verifiedAt: new Date() } },
    },
    select: { id: true },
  });
  return user.id;
}

// A throwaway user per test run, so per-user rate limits never carry over between runs.
export function createRunUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${FIXTURE.runEmailPrefix}${label}-${Date.now()}-${randomBytes(3).toString("hex")}@useframe.test`;
  return upsertUser(email, `E2E ${label}`).then((id) => ({ id, email }));
}

async function createProject(
  userId: string,
  slug: string,
  pipeline: { currentStep: "WEBSITE" | "DEPLOY"; deployStatus: "LOCKED" | "PENDING" },
) {
  await prisma.project.deleteMany({ where: { slug } });
  const project = await prisma.project.create({
    data: {
      userId,
      slug,
      name: slug === FIXTURE.workspaceSlug ? "E2E Workspace" : "E2E Deploy Ready",
      startupIdea: "A seeded project used by the automated test suites.",
      targetAudience: "Test runners",
      generationTier: "FREE",
      status: "READY",
    },
  });
  const version = await prisma.projectVersion.create({
    data: { projectId: project.id, versionNumber: 1, siteType: "SINGLE_PAGE", snapshot: SITE_SPEC },
  });
  await prisma.project.update({ where: { id: project.id }, data: { currentVersionId: version.id } });
  await prisma.pipelineState.create({
    data: {
      projectId: project.id,
      currentStep: pipeline.currentStep,
      researchStatus: "APPROVED",
      websiteStatus: pipeline.currentStep === "WEBSITE" ? "PENDING" : "APPROVED",
      seoStatus: pipeline.currentStep === "WEBSITE" ? "LOCKED" : "APPROVED",
      deployStatus: pipeline.deployStatus,
    },
  });
  return { projectId: project.id, versionId: version.id };
}

export type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

// Idempotent: safe to run before every suite against the same test database.
export async function seedFixtures() {
  const userA = await upsertUser(testEnv.userEmail, "E2E Free User");
  const userB = await upsertUser(testEnv.otherUserEmail, "E2E Other User");

  // Both are free tier: the free generation is spent and there are no credits.
  await prisma.user.updateMany({ where: { id: { in: [userA, userB] } }, data: { hasUsedFreeGeneration: true } });
  await prisma.creditBalance.deleteMany({ where: { userId: { in: [userA, userB] } } });

  const workspace = await createProject(userA, FIXTURE.workspaceSlug, { currentStep: "WEBSITE", deployStatus: "LOCKED" });
  const deployReady = await createProject(userA, FIXTURE.deploySlug, { currentStep: "DEPLOY", deployStatus: "PENDING" });

  const media = await prisma.mediaAsset.create({
    data: {
      projectId: workspace.projectId,
      userId: userA,
      kind: "IMAGE",
      status: "READY",
      title: "E2E fixture image",
      originalKey: `e2e/${workspace.projectId}/fixture.jpg`,
      originalMime: "image/jpeg",
      originalBytes: 1024,
    },
    select: { id: true },
  });

  const brief = await prisma.projectBrief.create({
    data: { userId: userA, projectId: workspace.projectId, status: "AWAITING_REVIEW", catalogVersion: 2 },
    select: { id: true },
  });

  const retiredPlan = {
    name: "E2E Retired Plan",
    priceMinor: 100,
    currency: "USD",
    credits: 10,
    rank: 99,
    isActive: false,
  };
  await prisma.plan.upsert({
    where: { slug: FIXTURE.retiredPlanSlug },
    create: { slug: FIXTURE.retiredPlanSlug, ...retiredPlan },
    update: retiredPlan,
  });

  return {
    userA,
    userB,
    workspace: { slug: FIXTURE.workspaceSlug, ...workspace },
    deployReady: { slug: FIXTURE.deploySlug, ...deployReady },
    mediaAssetId: media.id,
    briefId: brief.id,
  };
}

// The same one-time token the sign-in email would carry; no email is sent.
export async function mintMagicLink(email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      acceptedTerms: true,
      requestIp: "127.0.0.1",
    },
  });
  return raw;
}

export async function cleanupRunUsers(): Promise<void> {
  const identities = await prisma.identity.findMany({
    where: { email: { startsWith: FIXTURE.runEmailPrefix } },
    select: { userId: true },
  });
  await prisma.user.deleteMany({ where: { id: { in: identities.map((i) => i.userId) } } });
}

export { prisma };
