import type { AppConfig } from "../config.js";
import {
  type EventStorageService,
  LocalFileEventStorage,
  PostgresEventStorage,
} from "../services/event-storage-service.js";
import {
  type CloudStorageService,
  InMemoryCloudStorage,
  PostgresCloudStorage,
} from "../services/cloud-storage-service.js";

export const createEventStorage = (config: AppConfig): EventStorageService => {
  if (config.databaseUrl) {
    return new PostgresEventStorage(config.databaseUrl);
  }

  return new LocalFileEventStorage(config.localStoragePath);
};

export const createCloudStorage = (config: AppConfig): CloudStorageService => {
  if (config.databaseUrl) {
    return new PostgresCloudStorage(config.databaseUrl);
  }

  return new InMemoryCloudStorage();
};
