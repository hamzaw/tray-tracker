import { integer, pgEnum, pgTable, text, timestamp, bigint, serial } from "drizzle-orm/pg-core";

// Enums
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const eventTypeEnum = pgEnum("event_type", ["remove", "insert"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** User identifier (openId). Unique per user. */
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  lastSignedIn: timestamp("lastSignedIn").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tray events table - logs every removal and insertion event
 */
export const trayEvents = pgTable("tray_events", {
  id: text("id").primaryKey(), // UUID
  trayNumber: integer("tray_number").notNull(), // Current tray number (1-16)
  eventType: eventTypeEnum("event_type").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(), // Unix timestamp in milliseconds
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TrayEvent = typeof trayEvents.$inferSelect;
export type InsertTrayEvent = typeof trayEvents.$inferInsert;

/**
 * App settings table - stores current tray number and next change time
 * Single row table for single-user app
 */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1), // Always 1 for single-user
  currentTrayNumber: integer("current_tray_number").notNull().default(2), // Starting tray
  totalTrays: integer("total_trays").notNull().default(16), // Total number of trays
  nextTrayChangeTime: bigint("next_tray_change_time", { mode: "number" }).notNull(), // Unix timestamp in milliseconds for next Tuesday 7pm
  lastTrayChangeTime: bigint("last_tray_change_time", { mode: "number" }), // Unix timestamp of last automatic change
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
