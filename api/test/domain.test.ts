import { describe, expect, it } from "vitest";
import { incidentAction, isMonitorableUrl, monitorInput, percentile, uptimePercent } from "../src/domain.js";

describe("url validation", () => {
  it("accepts http(s) and rejects other schemes or credentials", () => {
    expect(isMonitorableUrl("https://example.com/health")).toBe(true);
    expect(isMonitorableUrl("ftp://example.com")).toBe(false);
    expect(isMonitorableUrl("javascript:alert(1)")).toBe(false);
    expect(isMonitorableUrl("https://user:pw@example.com")).toBe(false);
    expect(isMonitorableUrl("not a url")).toBe(false);
  });
  it("enforces a 30 second minimum interval", () => {
    const base = { name: "x", url: "https://example.com", intervalSeconds: 10 };
    expect(monitorInput.safeParse(base).success).toBe(false);
    expect(monitorInput.safeParse({ ...base, intervalSeconds: 30 }).success).toBe(true);
  });
});

describe("incident logic", () => {
  it("opens only after the failure threshold and only once", () => {
    expect(incidentAction(false, 1, 2, false)).toBe("none");
    expect(incidentAction(false, 2, 2, false)).toBe("open");
    expect(incidentAction(false, 3, 2, true)).toBe("none");
  });
  it("resolves on recovery", () => {
    expect(incidentAction(true, 0, 2, true)).toBe("resolve");
    expect(incidentAction(true, 0, 2, false)).toBe("none");
  });
});

describe("statistics", () => {
  it("computes uptime percentage", () => {
    expect(uptimePercent(0, 0)).toBeNull();
    expect(uptimePercent(999, 1000)).toBe(99.9);
    expect(uptimePercent(2, 3)).toBe(66.67);
  });
  it("computes percentiles", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });
});
