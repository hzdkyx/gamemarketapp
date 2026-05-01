import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const metricCardSource = readFileSync(resolve(currentDir, "metric-card.tsx"), "utf8");

describe("MetricCard source contract", () => {
  it("keeps metric tones mapped to the premium status palette", () => {
    expect(metricCardSource).toContain('success: {');
    expect(metricCardSource).toContain("text-emerald-300");
    expect(metricCardSource).toContain("text-amber-300");
    expect(metricCardSource).toContain("text-red-300");
    expect(metricCardSource).toContain("text-cyan");
  });

  it("keeps the loading state backed by the shared skeleton component", () => {
    expect(metricCardSource).toContain("loading = false");
    expect(metricCardSource).toContain("<LoadingSkeleton");
    expect(metricCardSource).toContain('className="mt-5 h-8 w-28"');
  });
});
