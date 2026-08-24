import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

// Load variables from .env.local
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
