import type { AppConfig } from "../config.js";
import {
  type EventStorageService,
  LocalFileEventStorage,
  PostgresEventStorage,
} from "../services/event-storage-service.js";

export const createEventStorage = (config: AppConfig): EventStorageService => {
  if (config.databaseUrl) {
    return new PostgresEventStorage(config.databaseUrl);
  }

  return new LocalFileEventStorage(config.localStoragePath);
};
