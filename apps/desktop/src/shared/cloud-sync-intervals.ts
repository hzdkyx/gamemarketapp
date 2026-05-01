export const CLOUD_SYNC_MIN_INTERVAL_SECONDS = 10;
export const CLOUD_SYNC_DEFAULT_INTERVAL_SECONDS = 30;
export const CLOUD_SYNC_INTERVAL_OPTIONS_SECONDS = [10, 30, 60, 300] as const;

export const normalizeCloudSyncIntervalSeconds = (
  value: number | null | undefined,
  fallback = CLOUD_SYNC_DEFAULT_INTERVAL_SECONDS,
): number => {
  const candidate = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(CLOUD_SYNC_MIN_INTERVAL_SECONDS, Math.round(candidate));
};
