import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "src", "main");

describe("local cloud sync pending markers", () => {
  it("marks local product, variant, stock and order updates as pending", () => {
    const files = [
      "repositories/product-repository.ts",
      "repositories/product-variant-repository.ts",
      "repositories/inventory-repository.ts",
      "repositories/order-repository.ts",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      expect(source).toContain("sync_status = 'pending'");
    }
  });

  it("schedules cloud autosync after local operational write IPC calls", () => {
    const sources = [
      readFileSync(resolve(repoRoot, "ipc", "products-ipc.ts"), "utf8"),
      readFileSync(resolve(repoRoot, "ipc", "inventory-ipc.ts"), "utf8"),
      readFileSync(resolve(repoRoot, "ipc", "orders-ipc.ts"), "utf8"),
    ].join("\n");

    expect(sources).toContain("notifyLocalChange");
  });

  it("does not count ignored local settings as eternal pending changes", () => {
    const source = readFileSync(
      resolve(repoRoot, "integrations", "cloud-sync", "cloud-sync-settings-service.ts"),
      "utf8"
    );

    expect(source).toContain("countPendingSettings");
    expect(source).toContain("isSensitiveSettingKey");
    expect(source).toContain("key NOT LIKE 'cloud_sync_%'");
    expect(source).toContain("key NOT LIKE 'webhook_server_%'");
    expect(source).toContain("key NOT LIKE 'gamemarket_%'");
  });
});
