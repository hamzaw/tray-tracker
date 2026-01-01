import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = sqliteTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** User identifier (openId). Unique per user. */
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tray events table - logs every removal and insertion event
 */
export const trayEvents = sqliteTable("tray_events", {
  id: text("id").primaryKey(), // UUID
  trayNumber: integer("tray_number").notNull(), // Current tray number (1-16)
  eventType: text("event_type", { enum: ["remove", "insert"] }).notNull(),
  timestamp: integer("timestamp").notNull(), // Unix timestamp in milliseconds
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export type TrayEvent = typeof trayEvents.$inferSelect;
export type InsertTrayEvent = typeof trayEvents.$inferInsert;

/**
 * App settings table - stores current tray number and next change time
 * Single row table for single-user app
 */
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1), // Always 1 for single-user
  currentTrayNumber: integer("current_tray_number").notNull().default(2), // Starting tray
  totalTrays: integer("total_trays").notNull().default(16), // Total number of trays
  nextTrayChangeTime: integer("next_tray_change_time").notNull(), // Unix timestamp in milliseconds for next Tuesday 7pm
  lastTrayChangeTime: integer("last_tray_change_time"), // Unix timestamp of last automatic change
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
