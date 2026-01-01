import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getAppSettings, initializeAppSettings } from "./db";

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Compliance Tracking", () => {
  beforeAll(async () => {
    // Initialize settings if not exists
    const settings = await getAppSettings();
    if (!settings) {
      const nextTuesday = new Date();
      nextTuesday.setDate(nextTuesday.getDate() + ((2 - nextTuesday.getDay() + 7) % 7 || 7));
      nextTuesday.setHours(19, 0, 0, 0);
      await initializeAppSettings(nextTuesday.getTime());
    }
  });

  it("should calculate today's compliance", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const compliance = await caller.compliance.getToday();

    expect(compliance).not.toBeNull();
    expect(compliance).toHaveProperty("date");
    expect(compliance).toHaveProperty("wearTime");
    expect(compliance).toHaveProperty("outTime");
    expect(compliance).toHaveProperty("compliancePercentage");
    expect(compliance).toHaveProperty("recommendedWearTime");
    expect(compliance).toHaveProperty("isCurrentlyOut");
    
    expect(compliance.compliancePercentage).toBeGreaterThanOrEqual(0);
    expect(compliance.compliancePercentage).toBeLessThanOrEqual(100);
    expect(compliance.recommendedWearTime).toBe(22.5 * 60 * 60 * 1000);
  });

  it("should calculate compliance for a specific date", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];

    const compliance = await caller.compliance.getDaily({ date: dateStr });

    expect(compliance).not.toBeNull();
    expect(compliance.date).toBe(dateStr);
    expect(compliance).toHaveProperty("wearTime");
    expect(compliance).toHaveProperty("outTime");
    expect(compliance).toHaveProperty("compliancePercentage");
    expect(compliance.compliancePercentage).toBeGreaterThanOrEqual(0);
    expect(compliance.compliancePercentage).toBeLessThanOrEqual(100);
  });

  it("should get compliance history for a date range", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const history = await caller.compliance.getHistory({
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    });

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history.length).toBeLessThanOrEqual(8); // 7 days + today

    if (history.length > 0) {
      const firstDay = history[0];
      expect(firstDay).toHaveProperty("date");
      expect(firstDay).toHaveProperty("wearTime");
      expect(firstDay).toHaveProperty("outTime");
      expect(firstDay).toHaveProperty("compliancePercentage");
      expect(firstDay.compliancePercentage).toBeGreaterThanOrEqual(0);
      expect(firstDay.compliancePercentage).toBeLessThanOrEqual(100);
    }
  });

  it("should calculate 100% compliance when tray is never removed", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Get a future date with no events
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = futureDate.toISOString().split("T")[0];

    const compliance = await caller.compliance.getDaily({ date: dateStr });

    // A day with no removal events should show 100% compliance
    expect(compliance.compliancePercentage).toBe(100);
    expect(compliance.outTime).toBe(0);
  });

  it("should use 22.5 hours as recommended wear time", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const compliance = await caller.compliance.getToday();

    const expectedRecommendedTime = 22.5 * 60 * 60 * 1000; // 22.5 hours in milliseconds
    expect(compliance.recommendedWearTime).toBe(expectedRecommendedTime);
  });
});
