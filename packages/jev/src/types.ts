export type JevFeature =
  | "input_guardrail"
  | "extractor"
  | "differentiator_quality"
  | "competitor_filter"
  | "chat_routing"
  | "chat_scope"
  | "critique_flags"
  | "planner_pick"
  | "retrieval_cache_verify";
export type JevMode = "off" | "shadow" | "on";
export type DecisionEvent = {
  feature: JevFeature;
  mode: JevMode;
  policyKey: string;
  accepted: boolean;
  agreement: boolean | null;
  confidence: number | null;
  durationMs: number;
  input: Record<string, string | number>;
};
