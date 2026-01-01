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

describe("Tray Tracking", () => {
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

  it("should log a tray removal event", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tray.logEvent({
      eventType: "remove",
      trayNumber: 2,
      timestamp: Date.now(),
    });

    expect(result.success).toBe(true);
  });

  it("should log a tray insertion event", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tray.logEvent({
      eventType: "insert",
      trayNumber: 2,
      timestamp: Date.now(),
    });

    expect(result.success).toBe(true);
  });

  it("should retrieve the last event", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Log an event first
    await caller.tray.logEvent({
      eventType: "remove",
      trayNumber: 2,
      timestamp: Date.now(),
    });

    const lastEvent = await caller.tray.getLastEvent();

    expect(lastEvent).not.toBeNull();
    expect(lastEvent?.eventType).toBe("remove");
    expect(lastEvent?.trayNumber).toBe(2);
  });

  it("should get app settings", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const settings = await caller.settings.get();

    expect(settings).not.toBeNull();
    expect(settings?.currentTrayNumber).toBeGreaterThanOrEqual(1);
    expect(settings?.currentTrayNumber).toBeLessThanOrEqual(16);
    expect(settings?.totalTrays).toBe(16);
  });

  it("should check and update tray number", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.checkAndUpdateTray();

    expect(result).toHaveProperty("changed");
    expect(result).toHaveProperty("newTrayNumber");
    expect(result).toHaveProperty("nextChangeTime");
    expect(result.newTrayNumber).toBeGreaterThanOrEqual(1);
    expect(result.newTrayNumber).toBeLessThanOrEqual(16);
  });

  it("should get analytics by tray", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const analytics = await caller.analytics.byTray();

    expect(Array.isArray(analytics)).toBe(true);
    
    if (analytics.length > 0) {
      const firstTray = analytics[0];
      expect(firstTray).toHaveProperty("trayNumber");
      expect(firstTray).toHaveProperty("removeCount");
      expect(firstTray).toHaveProperty("totalDuration");
      expect(firstTray).toHaveProperty("avgDuration");
    }
  });

  it("should get analytics by time period", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const analytics = await caller.analytics.byTimePeriod({
      startTime: sevenDaysAgo,
      endTime: now,
      groupBy: "day",
    });

    expect(Array.isArray(analytics)).toBe(true);
    
    if (analytics.length > 0) {
      const firstPeriod = analytics[0];
      expect(firstPeriod).toHaveProperty("period");
      expect(firstPeriod).toHaveProperty("removeCount");
      expect(firstPeriod).toHaveProperty("totalDuration");
      expect(firstPeriod).toHaveProperty("avgDuration");
    }
  });
});
