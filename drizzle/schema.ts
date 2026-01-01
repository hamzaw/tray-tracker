import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tray events table - logs every removal and insertion event
 */
export const trayEvents = mysqlTable("tray_events", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  trayNumber: int("tray_number").notNull(), // Current tray number (1-16)
  eventType: mysqlEnum("event_type", ["remove", "insert"]).notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(), // Unix timestamp in milliseconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TrayEvent = typeof trayEvents.$inferSelect;
export type InsertTrayEvent = typeof trayEvents.$inferInsert;

/**
 * App settings table - stores current tray number and next change time
 * Single row table for single-user app
 */
export const appSettings = mysqlTable("app_settings", {
  id: int("id").primaryKey().default(1), // Always 1 for single-user
  currentTrayNumber: int("current_tray_number").notNull().default(2), // Starting tray
  totalTrays: int("total_trays").notNull().default(16), // Total number of trays
  nextTrayChangeTime: bigint("next_tray_change_time", { mode: "number" }).notNull(), // Unix timestamp in milliseconds for next Tuesday 7pm
  lastTrayChangeTime: bigint("last_tray_change_time", { mode: "number" }), // Unix timestamp of last automatic change
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
