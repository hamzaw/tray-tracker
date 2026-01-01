import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DATABASE_URL || "./database.sqlite";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
