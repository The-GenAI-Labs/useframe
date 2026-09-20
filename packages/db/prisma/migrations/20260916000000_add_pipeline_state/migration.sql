-- CreateEnum
CREATE TYPE "PipelineStepId" AS ENUM ('RESEARCH', 'WEBSITE', 'SEO', 'DEPLOY');

-- CreateEnum
CREATE TYPE "PipelineStepStatus" AS ENUM ('LOCKED', 'PENDING', 'RUNNING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PipelineMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "pipeline_states" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mode" "PipelineMode" NOT NULL DEFAULT 'MANUAL',
    "currentStep" "PipelineStepId" NOT NULL DEFAULT 'RESEARCH',
    "researchStatus" "PipelineStepStatus" NOT NULL DEFAULT 'PENDING',
    "websiteStatus" "PipelineStepStatus" NOT NULL DEFAULT 'LOCKED',
    "seoStatus" "PipelineStepStatus" NOT NULL DEFAULT 'LOCKED',
    "deployStatus" "PipelineStepStatus" NOT NULL DEFAULT 'LOCKED',
    "feedbackHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_states_projectId_key" ON "pipeline_states"("projectId");

-- AddForeignKey
ALTER TABLE "pipeline_states" ADD CONSTRAINT "pipeline_states_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
