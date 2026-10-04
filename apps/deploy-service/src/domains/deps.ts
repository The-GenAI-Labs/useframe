import type { Db } from "@/site/sync.js";
import type { DnsLookup } from "./dns.js";
import type { Observation } from "./instructions.js";
import type { HttpsProber } from "./prober.js";
import type { CustomHostnameProvider } from "./provider.js";

export type DomainConfig = {
  baseDomain: string;
  reservedHosts: string[];
  blocklist: string[];
  edgeTarget: string;
  capacityLimit: number;
  ownershipWindowMs: number;
  routingWindowMs: number;
};

/** Short-lived state outside the DB: observations for the UI, rate-limit stamps, health streaks. */
export interface DomainScratch {
  getObservation(domainId: string): Promise<Observation | null>;
  setObservation(domainId: string, observation: Observation): Promise<void>;
  /** true if the stamp was set (i.e. the action is allowed now). */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  clear(key: string): Promise<void>;
}

export type RedeployResult = "queued" | "busy" | "skipped";

export type DomainDeps = {
  db: Db;
  provider: CustomHostnameProvider;
  dns: DnsLookup;
  prober: HttpsProber;
  scratch: DomainScratch;
  config: DomainConfig;
  /** syncSiteToKvs bound to the service's KV/Redis. */
  syncSite(siteId: string, options?: { deleteHosts?: string[] }): Promise<unknown>;
  /** Reads one KV entry, to self-heal the custom host's serve entry. */
  readKv(key: string): Promise<string | null>;
  /** Free system redeploy (triggeredBy "domain_change"). */
  requestRedeploy(input: { projectId: string; versionId: string; userId: string }): Promise<RedeployResult>;
  schedule(domainId: string, delayMs: number): Promise<void>;
  alert(message: string, fields?: Record<string, unknown>): void;
  now(): Date;
};
