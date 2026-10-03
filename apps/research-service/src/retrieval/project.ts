import {
  DECISION_AREAS,
  retrieveForProject as retrieve,
  saveCitations,
  getProjectResearch,
  type RetrievalInput,
  type RetrievalResult,
} from "@repo/rag";
import { env } from "@/config/env.js";
import { createAreaCache } from "./cache/cache.js";
import { cacheConfig } from "./cache/config.js";
import { cacheStore } from "./cache/store.js";
export { saveCitations, getProjectResearch };
export async function retrieveForProject(
  input: RetrievalInput,
): Promise<RetrievalResult> {
  if (env.RESEARCH_MOCK)
    return {
      areas: DECISION_AREAS.map((area) => ({
        area,
        hydePassage: "",
        findings: [],
      })),
      tensions: [],
    };
  return retrieve(input, createAreaCache(cacheStore, cacheConfig(env)));
}
