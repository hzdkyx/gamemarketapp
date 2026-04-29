import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const readOrdersSource = (): string => readFileSync(resolve(currentDir, "orders.tsx"), "utf8");

describe("orders page GameMarket release actions", () => {
  it("keeps delivered orders out of the primary delivery action", () => {
    const source = readOrdersSource();

    expect(source).toContain('order.status === "payment_confirmed" || order.status === "awaiting_delivery"');
    expect(source).toContain('order.status === "delivered"');
    expect(source).toContain("Entregue / aguardando liberação");
  });

  it("requires explicit confirmation for manual completion", () => {
    const source = readOrdersSource();

    expect(source).toContain("Concluir manualmente");
    expect(source).toContain("window.confirm");
    expect(source).toContain("manualCompletionConfirmed: true");
  });
});
