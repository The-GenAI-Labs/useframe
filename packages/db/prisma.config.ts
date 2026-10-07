import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Optional so `prisma generate` works in builds (Vercel/Turbo strict env) that have no database.
    url: process.env.DATABASE_URL ?? "",
  },
});
