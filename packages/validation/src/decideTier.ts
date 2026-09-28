export const FULL_PAGE_THRESHOLD = 4000;

export interface TierSignals {
  pageHeightPx: number;
  fullPageThresholdPx: number;
  usesAnimationLibrary: boolean;
  usesVirtualization: boolean;
  hasPinnedElements: boolean;
  capturedFrameCount: number;
  aiSelfReportedConfidence: "verified" | "uncertain";
}

export function decideValidationTier(signals: TierSignals): 1 | 2 {
  return signals.pageHeightPx > signals.fullPageThresholdPx ||
    signals.usesAnimationLibrary ||
    signals.usesVirtualization ||
    signals.hasPinnedElements ||
    signals.capturedFrameCount > 1
    ? 2
    : 1;
}
