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
  deleteTrayEvent,
  getTrayEventById,
  insertAchievement,
  getAllAchievements,
  getAchievementByType,
} from "./db";

// Helper function to calculate next Tuesday at 7pm in local time
// Note: This uses the server's local timezone. For user-specific timezones,
// calculate on the client and pass the timestamp.
function getNextTuesdayAt7PM(): number {
  const now = new Date();
  const daysUntilTuesday = (2 - now.getDay() + 7) % 7 || 7; // 2 = Tuesday
  const nextTuesday = new Date(now);
  nextTuesday.setDate(now.getDate() + daysUntilTuesday);
  // Use setHours which works in local timezone
  nextTuesday.setHours(19, 0, 0, 0); // 7pm local time
  
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
        const eventId = nanoid();
        await insertTrayEvent({
          id: eventId,
          trayNumber: input.trayNumber,
          eventType: input.eventType,
          timestamp: input.timestamp,
        });
        return { success: true, eventId };
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

    // Cancel a remove event (only within 60 seconds)
    cancelRemoveEvent: publicProcedure
      .input(z.object({ eventId: z.string() }))
      .mutation(async ({ input }) => {
        const event = await getTrayEventById(input.eventId);
        if (!event) {
          throw new Error("Event not found");
        }
        
        if (event.eventType !== "remove") {
          throw new Error("Can only cancel remove events");
        }
        
        const now = Date.now();
        const timeSinceEvent = now - event.timestamp;
        const sixtySeconds = 60 * 1000;
        
        if (timeSinceEvent > sixtySeconds) {
          throw new Error("Can only cancel events within 60 seconds");
        }
        
        await deleteTrayEvent(input.eventId);
        return { success: true };
      }),
  }),

  settings: router({
    // Get current app settings
    get: publicProcedure.query(async () => {
      let settings = await getAppSettings();
      
      // Initialize if not exists - use server's local time as fallback
      // Client should update this with local timezone calculation
      if (!settings) {
        const nextChangeTime = getNextTuesdayAt7PM();
        await initializeAppSettings(nextChangeTime);
        settings = await getAppSettings();
      }
      
      return settings;
    }),

    // Update next change time (calculated on client with local timezone)
    updateNextChangeTime: publicProcedure
      .input(z.object({ nextChangeTime: z.number() }))
      .mutation(async ({ input }) => {
        await updateAppSettings({
          nextTrayChangeTime: input.nextChangeTime,
        });
        return { success: true };
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

  achievements: router({
    // Get all achievements
    getAll: publicProcedure.query(async () => {
      return await getAllAchievements();
    }),

    // Check for new achievements and award them
    checkAndAward: publicProcedure.mutation(async () => {
      const newAchievements = [];
      const allEvents = await getRecentTrayEvents(10000);
      const allAchievements = await getAllAchievements();
      const existingTypes = new Set(allAchievements.map(a => a.achievementType));
      
      // Check for perfect day achievements
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startTime = today.getTime();
      const endTime = startTime + 24 * 60 * 60 * 1000;
      const todayEvents = await getTrayEventsByTimeRange(startTime, endTime);
      
      // Calculate today's compliance
      let totalOutTime = 0;
      let lastRemoveTime: number | null = null;
      const sortedTodayEvents = todayEvents.sort((a, b) => a.timestamp - b.timestamp);
      
      for (const event of sortedTodayEvents) {
        if (event.eventType === "remove") {
          lastRemoveTime = event.timestamp;
        } else if (event.eventType === "insert" && lastRemoveTime !== null) {
          totalOutTime += event.timestamp - lastRemoveTime;
          lastRemoveTime = null;
        }
      }
      
      if (lastRemoveTime !== null) {
        const now = Date.now();
        totalOutTime += now - lastRemoveTime;
      }
      
      const wearTime = (Date.now() - startTime) - totalOutTime;
      const recommendedWearTime = 22.5 * 60 * 60 * 1000;
      const compliancePercentage = Math.min(100, (wearTime / recommendedWearTime) * 100);
      
      // Perfect day (95%+ compliance)
      if (compliancePercentage >= 95 && !existingTypes.has("perfect_day")) {
        const achievement = {
          id: nanoid(),
          achievementType: "perfect_day" as const,
          title: "Perfect Day! 🌟",
          description: "Achieved 95%+ compliance in a single day",
          icon: "🌟",
          metadata: JSON.stringify({ compliancePercentage: Math.round(compliancePercentage) }),
        };
        await insertAchievement(achievement);
        newAchievements.push(achievement);
      }
      
      // Check for 3-day streak (85%+ compliance for 3 consecutive days)
      if (!existingTypes.has("streak_3")) {
        const now = Date.now();
        let streakCount = 0;
        const minCompliance = 85; // 85% minimum for streak
        
        // Check last 3 days (including today)
        for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
          const checkDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
          checkDate.setHours(0, 0, 0, 0);
          const dayStart = checkDate.getTime();
          const dayEnd = dayStart + 24 * 60 * 60 * 1000;
          
          const dayEvents = await getTrayEventsByTimeRange(dayStart, dayEnd);
          
          // Calculate compliance for this day
          let dayOutTime = 0;
          let dayLastRemoveTime: number | null = null;
          const sortedDayEvents = dayEvents.sort((a, b) => a.timestamp - b.timestamp);
          
          for (const event of sortedDayEvents) {
            if (event.eventType === "remove") {
              dayLastRemoveTime = event.timestamp;
            } else if (event.eventType === "insert" && dayLastRemoveTime !== null) {
              dayOutTime += event.timestamp - dayLastRemoveTime;
              dayLastRemoveTime = null;
            }
          }
          
          // If tray still out, count until end of day or now
          if (dayLastRemoveTime !== null) {
            const effectiveEnd = Math.min(now, dayEnd);
            if (dayLastRemoveTime < effectiveEnd) {
              dayOutTime += effectiveEnd - dayLastRemoveTime;
            }
          }
          
          const dayWearTime = (daysAgo === 0 ? Math.min(now - dayStart, 24 * 60 * 60 * 1000) : 24 * 60 * 60 * 1000) - dayOutTime;
          const dayRecommendedWearTime = daysAgo === 0 
            ? ((now - dayStart) / (24 * 60 * 60 * 1000)) * (22.5 * 60 * 60 * 1000)
            : 22.5 * 60 * 60 * 1000;
          const dayCompliance = dayRecommendedWearTime > 0 
            ? Math.min(100, (dayWearTime / dayRecommendedWearTime) * 100)
            : 0;
          
          if (dayCompliance >= minCompliance) {
            streakCount++;
          } else {
            break; // Streak broken
          }
        }
        
        if (streakCount >= 3) {
          const achievement = {
            id: nanoid(),
            achievementType: "streak_3" as const,
            title: "3-Day Streak! 🔥",
            description: "Maintained 85%+ compliance for 3 consecutive days",
            icon: "🔥",
            metadata: JSON.stringify({ streakDays: 3 }),
          };
          await insertAchievement(achievement);
          newAchievements.push(achievement);
        }
      }
      
      // Check for quick return achievements (tray out for less than 5 minutes)
      const recentEvents = allEvents.slice(0, 100).sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < recentEvents.length - 1; i++) {
        const removeEvent = recentEvents[i];
        const insertEvent = recentEvents[i + 1];
        
        if (removeEvent.eventType === "remove" && insertEvent.eventType === "insert" && 
            removeEvent.trayNumber === insertEvent.trayNumber) {
          const duration = insertEvent.timestamp - removeEvent.timestamp;
          const fiveMinutes = 5 * 60 * 1000;
          
          if (duration < fiveMinutes && !existingTypes.has("quick_return")) {
            const achievement = {
              id: nanoid(),
              achievementType: "quick_return" as const,
              title: "Quick Return! ⚡",
              description: "Put your tray back in less than 5 minutes",
              icon: "⚡",
              metadata: JSON.stringify({ duration }),
            };
            await insertAchievement(achievement);
            newAchievements.push(achievement);
            break; // Only award once
          }
        }
      }
      
      // Check for tray milestones
      const settings = await getAppSettings();
      if (settings) {
        const trayNumber = settings.currentTrayNumber;
        
        if (trayNumber >= 5 && !existingTypes.has("milestone_tray_5")) {
          const achievement = {
            id: nanoid(),
            achievementType: "milestone_tray_5" as const,
            title: "Tray 5 Milestone! 🎯",
            description: "Reached tray #5",
            icon: "🎯",
            metadata: JSON.stringify({ trayNumber: 5 }),
          };
          await insertAchievement(achievement);
          newAchievements.push(achievement);
        }
        
        if (trayNumber >= 10 && !existingTypes.has("milestone_tray_10")) {
          const achievement = {
            id: nanoid(),
            achievementType: "milestone_tray_10" as const,
            title: "Tray 10 Milestone! 🏆",
            description: "Reached tray #10",
            icon: "🏆",
            metadata: JSON.stringify({ trayNumber: 10 }),
          };
          await insertAchievement(achievement);
          newAchievements.push(achievement);
        }
        
        if (trayNumber >= 15 && !existingTypes.has("milestone_tray_15")) {
          const achievement = {
            id: nanoid(),
            achievementType: "milestone_tray_15" as const,
            title: "Tray 15 Milestone! 👑",
            description: "Reached tray #15",
            icon: "👑",
            metadata: JSON.stringify({ trayNumber: 15 }),
          };
          await insertAchievement(achievement);
          newAchievements.push(achievement);
        }
      }
      
      return { newAchievements };
    }),
  }),
});

export type AppRouter = typeof appRouter;

