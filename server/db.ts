import { eq, desc, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, trayEvents, InsertTrayEvent, appSettings, InsertAppSettings } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db) {
    const connectionString = ENV.databaseUrl || process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn("[Database] DATABASE_URL is not configured");
      return null;
    }
    try {
      _pool = new Pool({
        connectionString,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Tray event helpers
export async function insertTrayEvent(event: InsertTrayEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(trayEvents).values(event);
}

export async function getRecentTrayEvents(limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(trayEvents)
    .orderBy(desc(trayEvents.timestamp))
    .limit(limit);
}

export async function getTrayEventsByTrayNumber(trayNumber: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(trayEvents)
    .where(eq(trayEvents.trayNumber, trayNumber))
    .orderBy(desc(trayEvents.timestamp));
}

export async function getTrayEventsByTimeRange(startTime: number, endTime: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(trayEvents)
    .where(
      and(
        gte(trayEvents.timestamp, startTime),
        lte(trayEvents.timestamp, endTime)
      )
    )
    .orderBy(desc(trayEvents.timestamp));
}

export async function getLastTrayEvent() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(trayEvents)
    .orderBy(desc(trayEvents.timestamp))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

// App settings helpers
export async function getAppSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function initializeAppSettings(nextTrayChangeTime: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const settings: InsertAppSettings = {
    id: 1,
    currentTrayNumber: 2,
    totalTrays: 16,
    nextTrayChangeTime,
    lastTrayChangeTime: null,
  };
  
  // PostgreSQL upsert
  await db.insert(appSettings).values(settings).onConflictDoUpdate({
    target: appSettings.id,
    set: {
      updatedAt: new Date(),
    },
  });
}

export async function updateAppSettings(updates: Partial<InsertAppSettings>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(appSettings)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(appSettings.id, 1));
}

export async function incrementTrayNumber() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const settings = await getAppSettings();
  if (!settings) throw new Error("App settings not initialized");
  
  const newTrayNumber = settings.currentTrayNumber >= settings.totalTrays 
    ? settings.totalTrays 
    : settings.currentTrayNumber + 1;
  
  await updateAppSettings({
    currentTrayNumber: newTrayNumber,
    lastTrayChangeTime: Date.now(),
  });
  
  return newTrayNumber;
}
