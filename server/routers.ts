import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  insertTrayEvent,
  getRecentTrayEvents,
  getTrayEventsByTrayNumber,
  getTrayEventsByTimeRange,
  getLastTrayEvent,
  getAppSettings,
  initializeAppSettings,
  updateAppSettings,
  incrementTrayNumber,
} from "./db";

// Helper function to calculate next Tuesday at 7pm
function getNextTuesdayAt7PM(): number {
  const now = new Date();
  const daysUntilTuesday = (2 - now.getDay() + 7) % 7 || 7; // 2 = Tuesday
  const nextTuesday = new Date(now);
  nextTuesday.setDate(now.getDate() + daysUntilTuesday);
  nextTuesday.setHours(19, 0, 0, 0); // 7pm
  
  // If we're past 7pm on Tuesday, go to next week
  if (nextTuesday.getTime() <= now.getTime()) {
    nextTuesday.setDate(nextTuesday.getDate() + 7);
  }
  
  return nextTuesday.getTime();
}

export const appRouter = router({
  system: systemRouter,

  tray: router({
    // Log a tray event (remove or insert)
    logEvent: publicProcedure
      .input(
        z.object({
          eventType: z.enum(["remove", "insert"]),
          trayNumber: z.number().int().min(1).max(16),
          timestamp: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await insertTrayEvent({
          id: nanoid(),
          trayNumber: input.trayNumber,
          eventType: input.eventType,
          timestamp: input.timestamp,
        });
        return { success: true };
      }),

    // Get the last event to determine current state
    getLastEvent: publicProcedure.query(async () => {
      return await getLastTrayEvent();
    }),

    // Get recent events for display
    getRecentEvents: publicProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await getRecentTrayEvents(input.limit);
      }),

    // Get events by tray number
    getEventsByTray: publicProcedure
      .input(z.object({ trayNumber: z.number().int() }))
      .query(async ({ input }) => {
        return await getTrayEventsByTrayNumber(input.trayNumber);
      }),

    // Get events by time range
    getEventsByTimeRange: publicProcedure
      .input(
        z.object({
          startTime: z.number(),
          endTime: z.number(),
        })
      )
      .query(async ({ input }) => {
        return await getTrayEventsByTimeRange(input.startTime, input.endTime);
      }),
  }),

  settings: router({
    // Get current app settings
    get: publicProcedure.query(async () => {
      let settings = await getAppSettings();
      
      // Initialize if not exists
      if (!settings) {
        const nextChangeTime = getNextTuesdayAt7PM();
        await initializeAppSettings(nextChangeTime);
        settings = await getAppSettings();
      }
      
      return settings;
    }),

    // Check and update tray number if needed
    checkAndUpdateTray: publicProcedure.mutation(async () => {
      let settings = await getAppSettings();
      
      // Initialize if not exists
      if (!settings) {
        const nextChangeTime = getNextTuesdayAt7PM();
        await initializeAppSettings(nextChangeTime);
        settings = await getAppSettings();
      }
      
      if (!settings) {
        throw new Error("Failed to initialize settings");
      }
      
      const now = Date.now();
      
      // Check if it's time to increment
      if (now >= settings.nextTrayChangeTime) {
        const newTrayNumber = await incrementTrayNumber();
        const nextChangeTime = getNextTuesdayAt7PM();
        await updateAppSettings({
          nextTrayChangeTime: nextChangeTime,
        });
        
        return {
          changed: true,
          newTrayNumber,
          nextChangeTime,
        };
      }
      
      return {
        changed: false,
        newTrayNumber: settings.currentTrayNumber,
        nextChangeTime: settings.nextTrayChangeTime,
      };
    }),

    // Manually update settings (for testing or adjustments)
    update: publicProcedure
      .input(
        z.object({
          currentTrayNumber: z.number().int().min(1).max(16).optional(),
          nextTrayChangeTime: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await updateAppSettings(input);
        return { success: true };
      }),
  }),

  compliance: router({
    // Get daily compliance for a specific date
    getDaily: publicProcedure
      .input(z.object({ date: z.string() })) // YYYY-MM-DD format
      .query(async ({ input }) => {
        const targetDate = new Date(input.date);
        targetDate.setHours(0, 0, 0, 0);
        const startTime = targetDate.getTime();
        const endTime = startTime + 24 * 60 * 60 * 1000;
        
        const events = await getTrayEventsByTimeRange(startTime, endTime);
        
        // Calculate total time tray was OUT during this day
        let totalOutTime = 0;
        let lastRemoveTime: number | null = null;
        
        const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);
        
        for (const event of sortedEvents) {
          if (event.eventType === "remove") {
            lastRemoveTime = event.timestamp;
          } else if (event.eventType === "insert" && lastRemoveTime !== null) {
            totalOutTime += event.timestamp - lastRemoveTime;
            lastRemoveTime = null;
          }
        }
        
        // If tray is still out at end of day, count until end of day
        if (lastRemoveTime !== null) {
          const now = Date.now();
          const effectiveEndTime = Math.min(now, endTime);
          if (lastRemoveTime < effectiveEndTime) {
            totalOutTime += effectiveEndTime - lastRemoveTime;
          }
        }
        
        // Calculate wear time (24 hours - out time)
        const totalDayTime = 24 * 60 * 60 * 1000; // 24 hours in ms
        const wearTime = totalDayTime - totalOutTime;
        
        // Calculate compliance percentage based on 22.5 hour recommendation
        const recommendedWearTime = 22.5 * 60 * 60 * 1000; // 22.5 hours in ms
        const compliancePercentage = Math.min(100, (wearTime / recommendedWearTime) * 100);
        
        return {
          date: input.date,
          wearTime,
          outTime: totalOutTime,
          compliancePercentage: Math.round(compliancePercentage * 10) / 10, // Round to 1 decimal
          recommendedWearTime,
        };
      }),

    // Get compliance for today
    getToday: publicProcedure.query(async () => {
      const now = Date.now();
      const today = new Date(now);
      
      // Get start of today in local timezone
      const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime();
      const endTime = startTime + 24 * 60 * 60 * 1000;
      const dateStr = today.toISOString().split("T")[0];
      
      const events = await getTrayEventsByTimeRange(startTime, endTime);
      
      // Calculate total time tray was OUT during this day
      // Important: Only count out time that falls within today's boundaries
      let totalOutTime = 0;
      let lastRemoveTime: number | null = null;
      
      const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);
      
      for (const event of sortedEvents) {
        if (event.eventType === "remove") {
          lastRemoveTime = event.timestamp;
        } else if (event.eventType === "insert" && lastRemoveTime !== null) {
          // Clamp the removal period to today's boundaries
          const effectiveRemoveTime = Math.max(lastRemoveTime, startTime);
          const effectiveInsertTime = Math.min(event.timestamp, now);
          if (effectiveInsertTime > effectiveRemoveTime) {
            totalOutTime += effectiveInsertTime - effectiveRemoveTime;
          }
          lastRemoveTime = null;
        }
      }
      
      // If tray is still out, count from removal time (or start of today) until now
      if (lastRemoveTime !== null) {
        const effectiveRemoveTime = Math.max(lastRemoveTime, startTime);
        if (now > effectiveRemoveTime) {
          totalOutTime += now - effectiveRemoveTime;
        }
      }
      
      // Calculate wear time (time elapsed today - out time)
      const elapsedToday = Math.min(now - startTime, 24 * 60 * 60 * 1000);
      const wearTime = elapsedToday - totalOutTime;
      
      // Calculate compliance percentage based on pro-rated 22.5 hour recommendation
      // Pro-rated target = (elapsed time / 24 hours) * 22.5 hours
      const fullDayRecommendedTime = 22.5 * 60 * 60 * 1000; // 22.5 hours in ms
      const proRatedTarget = (elapsedToday / (24 * 60 * 60 * 1000)) * fullDayRecommendedTime;
      const compliancePercentage = Math.min(100, (wearTime / proRatedTarget) * 100);
      
      return {
        date: dateStr,
        wearTime,
        outTime: totalOutTime,
        compliancePercentage: Math.round(compliancePercentage * 10) / 10, // Round to 1 decimal
        recommendedWearTime: fullDayRecommendedTime,
        proRatedTarget: Math.round(proRatedTarget),
        elapsedToday: Math.round(elapsedToday),
        isCurrentlyOut: lastRemoveTime !== null,
      };
    }),

    // Get compliance history for a date range
    getHistory: publicProcedure
      .input(
        z.object({
          startDate: z.string(), // YYYY-MM-DD
          endDate: z.string(), // YYYY-MM-DD
        })
      )
      .query(async ({ input }) => {
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        
        const results = [];
        const currentDate = new Date(start);
        
        while (currentDate <= end) {
          const dateStr = currentDate.toISOString().split("T")[0];
          
          const dayStart = new Date(dateStr);
          dayStart.setHours(0, 0, 0, 0);
          const startTime = dayStart.getTime();
          const endTime = startTime + 24 * 60 * 60 * 1000;
          
          const events = await getTrayEventsByTimeRange(startTime, endTime);
          
          let totalOutTime = 0;
          let lastRemoveTime: number | null = null;
          
          const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);
          
          for (const event of sortedEvents) {
            if (event.eventType === "remove") {
              lastRemoveTime = event.timestamp;
            } else if (event.eventType === "insert" && lastRemoveTime !== null) {
              totalOutTime += event.timestamp - lastRemoveTime;
              lastRemoveTime = null;
            }
          }
          
          // If tray was still out at end of day, count until end of day or now
          if (lastRemoveTime !== null) {
            const now = Date.now();
            const effectiveEndTime = Math.min(now, endTime);
            if (lastRemoveTime < effectiveEndTime) {
              totalOutTime += effectiveEndTime - lastRemoveTime;
            }
          }
          
          const totalDayTime = 24 * 60 * 60 * 1000;
          const wearTime = totalDayTime - totalOutTime;
          const recommendedWearTime = 22.5 * 60 * 60 * 1000;
          const compliancePercentage = Math.min(100, (wearTime / recommendedWearTime) * 100);
          
          results.push({
            date: dateStr,
            wearTime,
            outTime: totalOutTime,
            compliancePercentage: Math.round(compliancePercentage * 10) / 10,
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return results;
      }),
  }),

  analytics: router({
    // Get analytics by tray number
    byTray: publicProcedure.query(async () => {
      const events = await getRecentTrayEvents(10000);
      
      // Group by tray number and calculate stats
      const trayStats = new Map<number, { removeCount: number; totalDuration: number; events: typeof events }>();
      
      for (const event of events) {
        if (!trayStats.has(event.trayNumber)) {
          trayStats.set(event.trayNumber, { removeCount: 0, totalDuration: 0, events: [] });
        }
        trayStats.get(event.trayNumber)!.events.push(event);
      }
      
      // Calculate durations for each tray
      const results = Array.from(trayStats.entries()).map(([trayNumber, stats]) => {
        const sortedEvents = stats.events.sort((a, b) => a.timestamp - b.timestamp);
        let removeCount = 0;
        let totalDuration = 0;
        let lastRemoveTime: number | null = null;
        
        for (const event of sortedEvents) {
          if (event.eventType === "remove") {
            removeCount++;
            lastRemoveTime = event.timestamp;
          } else if (event.eventType === "insert" && lastRemoveTime !== null) {
            totalDuration += event.timestamp - lastRemoveTime;
            lastRemoveTime = null;
          }
        }
        
        return {
          trayNumber,
          removeCount,
          totalDuration,
          avgDuration: removeCount > 0 ? totalDuration / removeCount : 0,
        };
      });
      
      return results.sort((a, b) => a.trayNumber - b.trayNumber);
    }),

    // Get analytics by time period
    byTimePeriod: publicProcedure
      .input(
        z.object({
          startTime: z.number(),
          endTime: z.number(),
          groupBy: z.enum(["day", "week", "month"]),
        })
      )
      .query(async ({ input }) => {
        const events = await getTrayEventsByTimeRange(input.startTime, input.endTime);
        
        // Group events by time period
        const periodStats = new Map<string, { removeCount: number; totalDuration: number; events: typeof events }>();
        
        for (const event of events) {
          const date = new Date(event.timestamp);
          let periodKey: string;
          
          if (input.groupBy === "day") {
            periodKey = date.toISOString().split("T")[0];
          } else if (input.groupBy === "week") {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            periodKey = weekStart.toISOString().split("T")[0];
          } else {
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          }
          
          if (!periodStats.has(periodKey)) {
            periodStats.set(periodKey, { removeCount: 0, totalDuration: 0, events: [] });
          }
          periodStats.get(periodKey)!.events.push(event);
        }
        
        // Calculate durations for each period
        const results = Array.from(periodStats.entries()).map(([period, stats]) => {
          const sortedEvents = stats.events.sort((a, b) => a.timestamp - b.timestamp);
          let removeCount = 0;
          let totalDuration = 0;
          let lastRemoveTime: number | null = null;
          
          for (const event of sortedEvents) {
            if (event.eventType === "remove") {
              removeCount++;
              lastRemoveTime = event.timestamp;
            } else if (event.eventType === "insert" && lastRemoveTime !== null) {
              totalDuration += event.timestamp - lastRemoveTime;
              lastRemoveTime = null;
            }
          }
          
          return {
            period,
            removeCount,
            totalDuration,
            avgDuration: removeCount > 0 ? totalDuration / removeCount : 0,
          };
        });
        
        return results.sort((a, b) => a.period.localeCompare(b.period));
      }),
  }),
});

export type AppRouter = typeof appRouter;

