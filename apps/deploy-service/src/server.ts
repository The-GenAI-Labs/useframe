import { prisma } from "@useframe/db";
import { env } from "@/config/env.js";
import { createApp } from "@/app.js";
import { closeContext, deps } from "@/context.js";

const start = async () => {
  await prisma.$connect();
  const server = createApp(deps, env.INTERNAL_SERVICE_SECRET).listen(env.PORT, () => {
    console.log(`Deploy service running on port ${env.PORT} (sites on *.${env.SITES_BASE_DOMAIN})`);
  });
  const shutdown = () => {
    server.close(() => {
      void closeContext().finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

start().catch((err) => {
  console.error("Failed to start deploy service:", err);
  process.exit(1);
});
