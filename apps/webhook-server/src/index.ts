import { loadConfig } from "./config.js";
import { createCloudStorage, createEventStorage } from "./db/connection.js";
import { buildServer } from "./server.js";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const storage = createEventStorage(config);
  const cloud = createCloudStorage(config);
  await storage.initialize();
  await cloud.initialize();

  const app = buildServer({ config, storage, cloud });
  const close = async (): Promise<void> => {
    await app.close();
    await storage.close();
    await cloud.close();
  };

  process.on("SIGINT", () => {
    void close().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void close().finally(() => process.exit(0));
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
