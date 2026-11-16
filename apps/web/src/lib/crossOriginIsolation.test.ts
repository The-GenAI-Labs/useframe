import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadUnlessCrossOriginIsolated } from "./crossOriginIsolation";

const reload = vi.fn();
const store = new Map<string, string>();

beforeEach(() => {
  reload.mockClear();
  store.clear();
  vi.stubGlobal("window", { location: { pathname: "/billing", reload }, crossOriginIsolated: true });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("reloadUnlessCrossOriginIsolated", () => {
  it("does nothing when the page already has the wanted isolation", () => {
    expect(reloadUnlessCrossOriginIsolated(true)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once to drop isolation, and never loops", () => {
    expect(reloadUnlessCrossOriginIsolated(false)).toBe(true);
    expect(reloadUnlessCrossOriginIsolated(false)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("can reload again after a load that got the wanted isolation", () => {
    reloadUnlessCrossOriginIsolated(false);
    (window as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated = false;
    reloadUnlessCrossOriginIsolated(false);
    (window as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated = true;
    expect(reloadUnlessCrossOriginIsolated(false)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
